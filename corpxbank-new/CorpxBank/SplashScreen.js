import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Constants } from 'expo-constants';

const { width, height } = Dimensions.get('window');

const SESSION_KEY = 'corpxbank_session';
const LOGIN_STATUS_KEY = 'corpxbank_logged';
const BIOMETRIC_KEY = 'biometriaAtiva';
const BIOMETRIC_TIMESTAMP_KEY = 'biometria_timestamp';
const LOGIN_KEY = 'login';
const PASSWORD_KEY = 'senha';

// 30 dias em milissegundos
const BIOMETRIC_EXPIRY_TIME = 30 * 24 * 60 * 60 * 1000;

export default function SplashScreen({ navigation }) {
  const [isLoading, setIsLoading] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [hasBiometricData, setHasBiometricData] = useState(false);
  const [hasLoggedInBefore, setHasLoggedInBefore] = useState(false);

  useEffect(() => {
    checkBiometricSupport();
    checkSavedBiometricData();
    checkPreviousLogin();
  }, []);

  const checkBiometricSupport = async () => {
    try {
      // Verificar se está rodando no Expo Go ou emulador
      if (Constants.appOwnership === 'expo') {
        console.log('🔒 Biometria desabilitada no Expo Go');
        setBiometricSupported(false);
        return;
      }

      // Verificar se o dispositivo tem hardware biométrico
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        console.log('🔒 Hardware biométrico não disponível');
        setBiometricSupported(false);
        return;
      }

      // Verificar se há biometrias cadastradas
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        console.log('🔒 Nenhuma biometria cadastrada no dispositivo');
        setBiometricSupported(false);
        return;
      }
      
      setBiometricSupported(true);
      console.log('🔒 Suporte biométrico ativo:', { compatible, enrolled });
    } catch (error) {
      console.error('❌ Erro ao verificar biometria:', error);
      setBiometricSupported(false);
    }
  };

  const checkSavedBiometricData = async () => {
    try {
      const biometricActive = await SecureStore.getItemAsync(BIOMETRIC_KEY);
      const biometricTimestamp = await SecureStore.getItemAsync(BIOMETRIC_TIMESTAMP_KEY);
      const savedLogin = await SecureStore.getItemAsync(LOGIN_KEY);
      const savedPassword = await SecureStore.getItemAsync(PASSWORD_KEY);
      
      // Verificar se a biometria expirou (30 dias)
      let isBiometricValid = false;
      if (biometricActive === 'true' && biometricTimestamp) {
        const timestamp = parseInt(biometricTimestamp);
        const currentTime = Date.now();
        const timeDiff = currentTime - timestamp;
        
        if (timeDiff < BIOMETRIC_EXPIRY_TIME) {
          isBiometricValid = true;
          console.log('🔒 Biometria válida, expira em:', Math.ceil((BIOMETRIC_EXPIRY_TIME - timeDiff) / (24 * 60 * 60 * 1000)), 'dias');
        } else {
          console.log('⏰ Biometria expirada, limpando dados...');
          // Limpar dados biométricos expirados
          await Promise.all([
            SecureStore.deleteItemAsync(BIOMETRIC_KEY),
            SecureStore.deleteItemAsync(BIOMETRIC_TIMESTAMP_KEY),
            SecureStore.deleteItemAsync(LOGIN_KEY),
            SecureStore.deleteItemAsync(PASSWORD_KEY)
          ]);
        }
      }
      
      setHasBiometricData(
        isBiometricValid && 
        savedLogin && 
        savedPassword
      );
    } catch (error) {
      console.error('❌ Erro ao verificar dados biométricos:', error);
      setHasBiometricData(false);
    }
  };

  const checkPreviousLogin = async () => {
    try {
      const loginStatus = await SecureStore.getItemAsync(LOGIN_STATUS_KEY);
      const savedLogin = await SecureStore.getItemAsync(LOGIN_KEY);
      
      // Se já houve login anterior ou há dados salvos, ocultar botão de cadastro
      setHasLoggedInBefore(loginStatus === 'true' || !!savedLogin);
    } catch (error) {
      console.error('❌ Erro ao verificar login anterior:', error);
      setHasLoggedInBefore(false);
    }
  };

  const handleBiometricLogin = async () => {
    try {
      setIsLoading(true);
      
      // Verificar novamente se a biometria está disponível
      if (!biometricSupported) {
        Alert.alert('Erro', 'Biometria não disponível neste dispositivo');
        return;
      }
      
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Use sua biometria para acessar o Corpx Bank',
        cancelLabel: 'Cancelar',
        fallbackLabel: 'Usar senha',
      });

      if (result.success) {
        const savedLogin = await SecureStore.getItemAsync(LOGIN_KEY);
        const savedPassword = await SecureStore.getItemAsync(PASSWORD_KEY);
        
        if (savedLogin && savedPassword) {
          // Simular login automático
          await performAutomaticLogin(savedLogin, savedPassword);
        } else {
          Alert.alert('Erro', 'Dados de login não encontrados');
        }
      } else if (result.error) {
        console.log('🔒 Autenticação biométrica cancelada ou falhou:', result.error);
      }
    } catch (error) {
      console.error('❌ Erro na autenticação biométrica:', error);
      // Não mostrar alert para erros de biometria em emuladores
      if (!error.message?.includes('not available') && !error.message?.includes('not enrolled')) {
        Alert.alert('Erro', 'Falha na autenticação biométrica');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const performAutomaticLogin = async (login, password) => {
    try {
      // Salvar sessão
      const sessionData = {
        timestamp: Date.now(),
        login: login,
      };
      
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(sessionData));
      await SecureStore.setItemAsync(LOGIN_STATUS_KEY, 'true');
      
      console.log('✅ Login biométrico realizado com sucesso');
      
      // Simular loading rápido antes de navegar
      setTimeout(() => {
        navigation.replace('WebView', {
          initialUrl: 'https://corpxbank.com.br/inicial.php'
        });
      }, 800);
    } catch (error) {
      console.error('❌ Erro no login automático:', error);
      Alert.alert('Erro', 'Falha no login automático');
      setIsLoading(false);
    }
  };

  const handleLogin = () => {
    setIsLoading(true);
    
    // Redirecionar direto para login via webview
    setTimeout(() => {
      navigation.replace('WebView', {
        initialUrl: 'https://corpxbank.com.br/login.php'
      });
    }, 500);
  };



  return (
    <View style={styles.container}>
      {/* Logo */}
      <View style={styles.logoContainer}>
        <Image 
          source={require('./logo.png')} 
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.subtitle}>
        Sua conta digital completa{"\n"}
        Simples, segura e sem complicações
      </Text>

      {/* Botão de Login */}
      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={[styles.button, styles.loginButton]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              {hasLoggedInBefore && biometricSupported && hasBiometricData && (
                <Text style={styles.biometricIcon}>👆</Text>
              )}
              <Text style={styles.buttonText}>
                {hasLoggedInBefore && biometricSupported && hasBiometricData 
                  ? "Fazer login com biometria" 
                  : "Entrar"
                }
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Informações adicionais */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>✓ Conta digital gratuita</Text>
        <Text style={styles.infoText}>✓ Cartão sem anuidade</Text>
        <Text style={styles.infoText}>✓ Transferências ilimitadas</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoContainer: {
    marginBottom: 40,
    alignItems: 'center',
    shadowColor: '#2E7D32',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  logoImage: {
    width: 180,
    height: 180,
  },
  subtitle: {
    color: '#333333',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 60,
    lineHeight: 26,
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  buttonsContainer: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 50,
  },
  button: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  biometricButton: {
    backgroundColor: '#2E7D32',
    borderColor: '#4CAF50',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#4CAF50',
  },
  loginButton: {
    backgroundColor: '#2E7D32',
    borderColor: '#4CAF50',
    shadowColor: '#2E7D32',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  registerButton: {
    backgroundColor: '#1B5E20',
    borderColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOpacity: 0.3,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  biometricIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  infoContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    width: '100%',
    maxWidth: 320,
  },
  infoText: {
    color: '#666666',
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
});