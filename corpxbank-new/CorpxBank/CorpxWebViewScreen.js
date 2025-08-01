import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  BackHandler,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  StatusBar,
  Platform,
  Image,
  SafeAreaView,
  Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as WebBrowser from 'expo-web-browser';
import { Constants } from 'expo-constants';

const SESSION_KEY = 'corpxbank_session';
const LOGIN_STATUS_KEY = 'corpxbank_logged';
const BIOMETRIC_KEY = 'biometriaAtiva';
const BIOMETRIC_TIMESTAMP_KEY = 'biometria_timestamp';
const LOGIN_KEY = 'login';
const PASSWORD_KEY = 'senha';

// 30 dias em milissegundos
const BIOMETRIC_EXPIRY_TIME = 30 * 24 * 60 * 60 * 1000;

export default function CorpxWebViewScreen({ navigation, route }) {
  const webViewRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [loginCredentials, setLoginCredentials] = useState(null);
  
  // Determinar URL inicial
  const initialUrl = route?.params?.initialUrl || 'https://corpxbank.com.br/inicial.php';
  const isLoginScreen = route?.params?.isLoginScreen || false;
  const isSignupScreen = route?.params?.isSignupScreen || false;

  useEffect(() => {
    const backAction = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      } else {
        handleLogout();
        return true;
      }
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [canGoBack]);

  const handleNavigationStateChange = (navState) => {
    setCurrentUrl(navState.url);
    setCanGoBack(navState.canGoBack);
    
    // Detectar login bem-sucedido quando chegar na página inicial
    if (navState.url.includes('inicial.php') && isLoginScreen) {
      console.log('🎯 Login bem-sucedido detectado - URL:', navState.url);
      handleSuccessfulLogin();
    }
  };

  const handleSuccessfulLogin = async () => {
    try {
      console.log('✅ Login detectado com sucesso');
      
      const sessionData = {
        timestamp: Date.now(),
        url: currentUrl,
      };
      
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(sessionData));
      await SecureStore.setItemAsync(LOGIN_STATUS_KEY, 'true');
      
      if (loginCredentials && Constants.appOwnership !== 'expo') {
        const biometricSupported = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        const biometricActive = await SecureStore.getItemAsync(BIOMETRIC_KEY);
        
        if (biometricSupported && enrolled && biometricActive !== 'true') {
          setShowBiometricPrompt(true);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao salvar sessão:', error);
    }
  };

  const handleBiometricPrompt = async (enable) => {
    try {
      if (enable && loginCredentials) {
        const currentTimestamp = Date.now().toString();
        
        await Promise.all([
          SecureStore.setItemAsync(BIOMETRIC_KEY, 'true'),
          SecureStore.setItemAsync(BIOMETRIC_TIMESTAMP_KEY, currentTimestamp),
          SecureStore.setItemAsync(LOGIN_KEY, loginCredentials.login),
          SecureStore.setItemAsync(PASSWORD_KEY, loginCredentials.password)
        ]);
        
        console.log('🔒 Biometria ativada com timestamp:', currentTimestamp);
        
        Alert.alert(
          'Biometria Ativada',
          'Agora você pode fazer login usando sua biometria por 30 dias!'
        );
      } else {
        await SecureStore.setItemAsync(BIOMETRIC_KEY, 'false');
      }
    } catch (error) {
      console.error('❌ Erro ao configurar biometria:', error);
    } finally {
      setShowBiometricPrompt(false);
      setLoginCredentials(null);
    }
  };

  const handleLogout = async () => {
    try {
      // Apenas limpar sessão atual, manter dados biométricos
      await Promise.all([
        SecureStore.deleteItemAsync(SESSION_KEY),
        SecureStore.deleteItemAsync(LOGIN_STATUS_KEY)
      ]);
      
      console.log('🔓 Logout realizado - dados biométricos mantidos');
      navigation.replace('Splash');
    } catch (error) {
      console.error('❌ Erro no logout:', error);
      navigation.replace('Splash');
    }
  };

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('📨 Mensagem WebView recebida:', data);
      
      switch (data.type) {
        case 'LOGIN_SUCCESS':
          if (data.credentials) {
            setLoginCredentials(data.credentials);
          }
          handleSuccessfulLogin();
          break;
          
        case 'LOGIN_ATTEMPT':
          if (data.credentials && isLoginScreen) {
            setLoginCredentials(data.credentials);
            console.log('🔐 Credenciais de login capturadas');
          }
          break;
          
        case 'LOGOUT':
          handleLogout();
          break;
          
        default:
          console.log('📨 Mensagem não reconhecida:', data.type);
          break;
      }
    } catch (error) {
      console.log('📨 Mensagem não-JSON recebida:', event.nativeEvent.data);
    }
  };

  const handleError = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    console.error('❌ Erro na WebView:', nativeEvent);
    
    Alert.alert(
      'Erro de Conexão',
      'Não foi possível carregar a página. Verifique sua conexão com a internet.',
      [
        {
          text: 'Tentar Novamente',
          onPress: () => {
            if (webViewRef.current) {
              webViewRef.current.reload();
            }
          }
        },
        {
          text: 'Voltar',
          onPress: () => navigation.goBack()
        }
      ]
    );
  };

  const handleRenderProcessGone = () => {
    console.log('⚠️ Processo da WebView encerrado, recarregando...');
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  const onShouldStartLoadWithRequest = (request) => {
    const { url } = request;
    
    if (url.startsWith('mailto:') || 
        url.startsWith('tel:') || 
        url.startsWith('sms:') ||
        url.startsWith('whatsapp:')) {
      return false;
    }
    
    // Detectar links de download de PDF e CSV
    if (url.includes('.pdf') || url.includes('.csv') || 
        url.includes('download') || url.includes('export')) {
      handleFileDownload(url);
      return false;
    }
    
    return true;
  };

  const handleFileDownload = async (downloadUrl) => {
    try {
      console.log('📥 Tentando download:', downloadUrl);
      
      // Primeiro, tentar abrir com Linking (funciona bem para PDFs)
      const supported = await Linking.canOpenURL(downloadUrl);
      if (supported) {
        await Linking.openURL(downloadUrl);
        return;
      }
      
      // Fallback: usar expo-web-browser para abrir em navegador
      await WebBrowser.openBrowserAsync(downloadUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        showTitle: true,
        enableBarCollapsing: true,
      });
      
    } catch (error) {
      console.error('❌ Erro no download:', error);
      
      // Último fallback: tentar download manual
      try {
        await downloadFileManually(downloadUrl);
      } catch (downloadError) {
        console.error('❌ Erro no download manual:', downloadError);
        Alert.alert(
          'Erro no Download',
          'Não foi possível baixar o arquivo. Tente novamente ou entre em contato com o suporte.',
          [{ text: 'OK' }]
        );
      }
    }
  };

  const downloadFileManually = async (url) => {
    try {
      // Determinar nome e extensão do arquivo
      const fileName = url.split('/').pop() || 'arquivo';
      const fileExtension = fileName.includes('.') ? '' : '.pdf';
      const finalFileName = fileName + fileExtension;
      
      // Fazer download usando expo-file-system
      const downloadResult = await FileSystem.downloadAsync(
        url,
        FileSystem.documentDirectory + finalFileName
      );
      
      if (downloadResult.status === 200) {
        // Compartilhar o arquivo baixado
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloadResult.uri);
        } else {
          Alert.alert(
            'Download Concluído',
            `Arquivo salvo em: ${downloadResult.uri}`,
            [{ text: 'OK' }]
          );
        }
      } else {
        throw new Error('Download falhou');
      }
    } catch (error) {
      throw error;
    }
  };

  const onFileDownload = ({ nativeEvent }) => {
    const { downloadUrl } = nativeEvent;
    console.log('📥 Download detectado pela WebView:', downloadUrl);
    handleFileDownload(downloadUrl);
  };

  const getInjectedJavaScript = () => {
    if (!isLoginScreen) return '';
    
    return `
      (function() {
        console.log('🔐 Script de captura de login injetado');
        
        // Função para capturar dados do formulário
        function captureLoginData() {
          const forms = document.querySelectorAll('form');
          
          forms.forEach(form => {
            form.addEventListener('submit', function(e) {
              try {
                const formData = new FormData(form);
                const loginField = form.querySelector('input[type="email"], input[name*="login"], input[name*="email"], input[name*="user"]');
                const passwordField = form.querySelector('input[type="password"]');
                
                if (loginField && passwordField && loginField.value && passwordField.value) {
                  const credentials = {
                    login: loginField.value,
                    password: passwordField.value
                  };
                  
                  console.log('🔐 Credenciais capturadas:', credentials.login);
                  
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'LOGIN_ATTEMPT',
                    credentials: credentials
                  }));
                }
              } catch (error) {
                console.error('❌ Erro ao capturar credenciais:', error);
              }
            });
          });
        }
        
        // Executar quando a página carregar
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', captureLoginData);
        } else {
          captureLoginData();
        }
        
        // Observar mudanças no DOM para formulários carregados dinamicamente
        const observer = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length > 0) {
              captureLoginData();
            }
          });
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        
      })();
      true;
    `;
  };

  if (showBiometricPrompt) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1a472a" />
        <View style={styles.biometricContainer}>
          <Image 
            source={require('./logo.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.biometricTitle}>Ativar Biometria?</Text>
          <Text style={styles.biometricText}>
            Deseja usar sua biometria para fazer login mais rapidamente?
          </Text>
          <View style={styles.biometricButtons}>
            <TouchableOpacity 
              style={[styles.button, styles.buttonSecondary]} 
              onPress={() => handleBiometricPrompt(false)}
            >
              <Text style={styles.buttonSecondaryText}>Agora Não</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.buttonPrimary]} 
              onPress={() => handleBiometricPrompt(true)}
            >
              <Text style={styles.buttonPrimaryText}>Ativar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a472a" />
      
      {isLoading && (
        <View style={styles.loadingContainer}>
          <Image 
            source={require('./logo.png')} 
            style={styles.loadingLogo}
            resizeMode="contain"
          />
          <ActivityIndicator size="large" color="#1a472a" style={styles.loadingSpinner} />
          <Text style={styles.loadingText}>Carregando Corpx Bank...</Text>
        </View>
      )}
      
      <WebView
        ref={webViewRef}
        source={{ uri: initialUrl }}
        style={styles.webview}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={handleMessage}
        onFileDownload={onFileDownload}
        injectedJavaScript={getInjectedJavaScript()}

        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        allowsDownload={true}
        onError={handleError}
        onRenderProcessGone={handleRenderProcessGone}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36 CorpxBank/1.0"
      />
      
      {!isLoading && currentUrl.includes('inicial.php') && (
        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Sair</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a472a',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    zIndex: 1000,
  },
  loadingLogo: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },
  loadingSpinner: {
    marginBottom: 15,
  },
  loadingText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
    textAlign: 'center',
  },
  logoutButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  logoutButtonText: {
    color: '#1a472a',
    fontSize: 14,
    fontWeight: '600',
  },
  biometricContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#fff',
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 30,
  },
  biometricTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
    marginBottom: 15,
    textAlign: 'center',
  },
  biometricText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  biometricButtons: {
    flexDirection: 'row',
    gap: 15,
  },
  button: {
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 120,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#1a472a',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#1a472a',
  },
  buttonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondaryText: {
    color: '#1a472a',
    fontSize: 16,
    fontWeight: '600',
  },
});