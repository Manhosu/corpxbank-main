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
    // Navegar para a WebView após 3 segundos
    const timer = setTimeout(() => {
      navigation.replace('WebView');
    }, 3000);

    return () => clearTimeout(timer); // Limpar o timer se o componente for desmontado
  }, [navigation]);

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





  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.logoContainer}>
        <Image
          source={require('../CorpxVdLogo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#005A2B" />
        <Text style={styles.loadingText}>Carregando...</Text>
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
  },
  logoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: width * 0.6,
    height: height * 0.3,
  },
  loaderContainer: {
    position: 'absolute',
    bottom: 100,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333333',
  },
});