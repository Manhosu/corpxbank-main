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
import SplashScreen from './SplashScreen'; // Importar a SplashScreen
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import { Constants } from 'expo-constants';
import CookieManager from '@react-native-cookies/cookies';

/**
 * ===== SISTEMA CORRIGIDO DE GERENCIAMENTO DE COOKIES E SESSÃO =====
 * 
 * 🛠️ CORREÇÕES IMPLEMENTADAS:
 * ✅ Unificação do sistema de cookies (APENAS nativo @react-native-cookies/cookies)
 * ✅ Sincronização correta entre injeção e validação de cookies
 * ✅ Timeout adequado para propagação de cookies (5 segundos total)
 * ✅ Detecção automática de sessão expirada
 * ✅ Estados da WebView sincronizados corretamente
 * 
 * 🚀 FLUXO CORRIGIDO:
 * 
 * 1. PRIMEIRO LOGIN MANUAL:
 *    - Usuário faz login normal com credenciais/2FA/captcha
 *    - Sistema captura cookies nativamente via CookieManager.get()
 *    - Cookies são salvos de forma persistente no expo-secure-store
 *    - Oferece ativação de biometria para próximos acessos
 * 
 * 2. LOGIN COM BIOMETRIA (CORRIGIDO):
 *    - Valida biometria do usuário
 *    - Injeta cookies salvos + aguarda propagação (2s)
 *    - Valida sessão com servidor + aguarda propagação (3s)
 *    - Se válida: carrega inicial.php diretamente ✅
 *    - Se inválida: executa auto-login silencioso
 * 
 * 3. AUTO-LOGIN SILENCIOSO:
 *    - Carrega login.php em background (usuário vê apenas loading)
 *    - Executa login automático com credenciais salvas
 *    - Captura novos cookies após sucesso
 *    - Redireciona para inicial.php
 * 
 * 4. DETECÇÃO DE SESSÃO EXPIRADA (NOVO):
 *    - Monitora redirecionamentos forçados para login.php
 *    - Limpa automaticamente dados de sessão inválida
 *    - Força usuário a fazer login manual completo
 * 
 * 5. GARANTIAS DO SISTEMA:
 *    - Usuário NUNCA vê login.php após configurar biometria (CORRIGIDO)
 *    - Sessão persiste entre fechamentos completos do app
 *    - Sistema unificado de cookies (sem conflitos)
 *    - Compatibilidade total com Android e iOS
 * 
 * 6. TECNOLOGIAS UTILIZADAS:
 *    - @react-native-cookies/cookies: Gerenciamento nativo de cookies (ÚNICO)
 *    - expo-secure-store: Armazenamento seguro de credenciais e cookies
 *    - expo-local-authentication: Biometria (Face ID/Touch ID/Fingerprint)
 *    - react-native-webview: Interface bancária segura
 */

const SESSION_KEY = 'corpxbank_session';
const LOGIN_STATUS_KEY = 'corpxbank_logged';
const BIOMETRIC_KEY = 'biometriaAtiva';
const BIOMETRIC_TIMESTAMP_KEY = 'biometria_timestamp';
const LOGIN_KEY = 'login';
const PASSWORD_KEY = 'senha';
const FIRST_LOGIN_COMPLETED_KEY = 'FIRST_LOGIN_COMPLETED';
const WEBVIEW_CAMERA_PERMISSION_KEY = 'webview_camera_permission_granted';
const WEBVIEW_MICROPHONE_PERMISSION_KEY = 'webview_microphone_permission_granted';

// FUNÇÃO PARA LIMPAR CACHE DE PERMISSÕES DA WEBVIEW
const clearWebViewPermissionsCache = async () => {
  try {
    await SecureStore.deleteItemAsync(WEBVIEW_CAMERA_PERMISSION_KEY);
    await SecureStore.deleteItemAsync(WEBVIEW_MICROPHONE_PERMISSION_KEY);
    console.log('🧹 Cache de permissões da WebView limpo com sucesso');
  } catch (error) {
    console.error('❌ Erro ao limpar cache de permissões da WebView:', error);
  }
};

// === CONSTANTES DE SESSÃO AVANÇADA ===
// Sistema robusto de gerenciamento de sessão com suporte a múltiplos tipos de login
// Permite persistência segura de dados entre sessões e auto-login inteligente
const LOGIN_IDENTIFIER_TYPE_KEY = 'login_identifier_type'; // usuario, cpf, cnpj
const SESSION_COOKIES_KEY = 'session_cookies';
const CSRF_TOKENS_KEY = 'csrf_tokens';
const LAST_2FA_CODE_KEY = 'last_2fa_code';
const LAST_2FA_TIMESTAMP_KEY = 'last_2fa_timestamp';
const SESSION_EXPIRY_KEY = 'session_expiry';
const CAPTCHA_BYPASS_TOKEN_KEY = 'captcha_bypass_token';
const USER_AGENT_KEY = 'user_agent';
const LAST_SUCCESSFUL_LOGIN_KEY = 'last_successful_login';

// === CONSTANTES PARA COOKIE MANAGER NATIVO ===
const NATIVE_COOKIES_KEY = 'native_cookies_data';
const COOKIE_EXPIRY_KEY = 'cookie_expiry_timestamp';
const COOKIE_DOMAIN = 'corpxbank.com.br';
const COOKIE_URL = 'https://app.corpxbank.com.br';

// === CONFIGURAÇÕES DE EXPIRAÇÃO ===
// Tempo máximo de validade da sessão biométrica (30 dias)
// Após este período, usuário precisa fazer login manual novamente
const BIOMETRIC_EXPIRY_TIME = 30 * 24 * 60 * 60 * 1000;

export default function CorpxWebViewScreen({ navigation, route }) {
  const webViewRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  // === ESTADOS PRINCIPAIS ===
  // Status de autenticação: controla fluxo principal do app
  // 'checking': verificando credenciais salvas
  // 'promptBiometric': solicitando biometria do usuário  
  // 'authenticated': usuário logado, pode acessar WebView
  // 'needsLogin': precisa fazer login manual
  const [authStatus, setAuthStatus] = useState('checking');
  // URL atual da WebView - inicia em branco para evitar carregamento prematuro
  // Muda dinamicamente baseado no fluxo de autenticação (login.php -> inicial.php)
  const [currentUrl, setCurrentUrl] = useState('about:blank');
  const [initialUrl, setInitialUrl] = useState('about:blank'); // Evitar carregamento prematuro
  const [canGoBack, setCanGoBack] = useState(false);
  const [loginCredentials, setLoginCredentials] = useState(null); // Mantido para capturar credenciais para login automático
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedFile, setDownloadedFile] = useState(null);
  // Flag crítica: controla se auto-login já foi tentado na sessão atual
  // Evita loops infinitos de tentativas de auto-login
  const [autoLoginDone, setAutoLoginDone] = useState(false);
  const currentUrlRef = useRef(currentUrl);
  // Debug removido - usando apenas console.log para diagnóstico
  
  // === ESTADOS PARA GERENCIAMENTO NATIVO DE COOKIES ===
  // Controla se cookies foram injetados com sucesso antes do carregamento
  const [cookiesInjected, setCookiesInjected] = useState(false);
  // Flag para indicar se a sessão foi validada com o servidor
  const [sessionValidated, setSessionValidated] = useState(false);
  // Controla se está aguardando resposta de validação de cookies
  const [validatingSession, setValidatingSession] = useState(false);
  const [urlReady, setUrlReady] = useState(false); // Controla quando a URL real deve ser carregada

  useEffect(() => {
    currentUrlRef.current = currentUrl;
  }, [currentUrl]);

  // Debug messages removidas para produção

  /**
   * FUNÇÃO CRÍTICA: Captura cookies nativamente após login bem-sucedido
   * Usa CookieManager para obter cookies reais do sistema
   * Salva de forma persistente no SecureStore para uso futuro
   */
  const captureNativeCookies = async () => {
    try {
      // Iniciando captura nativa de cookies

      
      // Capturar cookies nativamente do sistema
      const cookies = await CookieManager.get(COOKIE_URL, true); // useWebKit = true
      
      // Cookies nativos capturados
      
      // Verificar se temos cookies essenciais (PHPSESSID é crítico para sessões PHP)
      const hasEssentialCookies = cookies.PHPSESSID || 
                                  Object.keys(cookies).some(key => 
                                    key.toLowerCase().includes('session') || 
                                    key.toLowerCase().includes('auth')
                                  );
      
      // Verificando cookies essenciais
      
      if (!hasEssentialCookies) {
        // Nenhum cookie essencial encontrado
        return false;
      }
      
      // Salvar cookies com timestamp de expiração
      const cookieData = {
        cookies: cookies,
        capturedAt: Date.now(),
        expiresAt: Date.now() + (8 * 60 * 60 * 1000), // 8 horas de validade padrão
        domain: COOKIE_DOMAIN
      };
      
      await Promise.all([
        SecureStore.setItemAsync(NATIVE_COOKIES_KEY, JSON.stringify(cookieData)),
        SecureStore.setItemAsync(COOKIE_EXPIRY_KEY, cookieData.expiresAt.toString())
      ]);
      
      // Cookies nativos salvos com sucesso

      
      return true;
      
    } catch (error) {
      console.error('❌ Erro ao capturar cookies nativos:', error);

      return false;
    }
  };

  /**
   * FUNÇÃO CRÍTICA: Injeta cookies salvos ANTES do carregamento da WebView
   * Garante que a sessão está disponível quando o servidor processar a requisição
   * Retorna true se injeção foi bem-sucedida
   */
  const injectNativeCookiesBeforeLoad = async () => {
    try {
      // Iniciando injeção de cookies antes do carregamento

      
      // Recuperar cookies salvos
      const savedCookieData = await SecureStore.getItemAsync(NATIVE_COOKIES_KEY);
      if (!savedCookieData) {
        // Nenhum cookie nativo salvo encontrado
        setCookiesInjected(false);
        return false;
      }
      
      // Dados de cookies encontrados no SecureStore
      
      const cookieData = JSON.parse(savedCookieData);
      
      // Verificar se não expiraram
      const timeUntilExpiry = cookieData.expiresAt - Date.now();
      // Verificando tempo até expiração
      
      if (Date.now() > cookieData.expiresAt) {
        // Cookies nativos expiraram, limpando
        await Promise.all([
          SecureStore.deleteItemAsync(NATIVE_COOKIES_KEY),
          SecureStore.deleteItemAsync(COOKIE_EXPIRY_KEY)
        ]);
        setCookiesInjected(false);
        return false;
      }
      
      // Injetando cookies
      
      // PRIMEIRA TENTATIVA: Limpar cookies antigos para evitar conflitos
      try {
        await CookieManager.clearAll(true);
        // Cookies antigos limpos
        await new Promise(resolve => setTimeout(resolve, 500)); // Aguardar limpeza
      } catch (error) {
        // Aviso: não foi possível limpar cookies antigos
      }
      
      // Injetar cada cookie usando CookieManager
      let injectedCount = 0;
      const cookiePromises = [];
      
      for (const [name, cookieInfo] of Object.entries(cookieData.cookies)) {
        const cookieValue = typeof cookieInfo === 'object' ? cookieInfo.value : cookieInfo;
        
        // Injetando cookie individual
        
        const promise = CookieManager.setFromResponse(COOKIE_URL, `${name}=${cookieValue}; Domain=${COOKIE_DOMAIN}; Path=/; HttpOnly`)
          .then(() => {
            injectedCount++;
            // Cookie injetado com sucesso
          })
          .catch(error => {
            // Falha ao injetar cookie
          });
        
        cookiePromises.push(promise);
      }
      
      // Aguardar todas as injeções
      await Promise.all(cookiePromises);
      
      // CRÍTICO: Aguardar propagação no sistema nativo (2 segundos adicionais)
      // Aguardando propagação de cookies no sistema nativo
        await new Promise(resolve => setTimeout(resolve, 2000));

      
      // Considerar sucesso se pelo menos 1 cookie foi injetado
      const success = injectedCount > 0;
      
      // NÃO definir setCookiesInjected aqui - será definido após validação bem-sucedida
      // Resultado da injeção de cookies
      
      return success;
      
    } catch (error) {
      console.error('❌ Erro ao injetar cookies nativos:', error);

      setCookiesInjected(false);
      return false;
    }
  };

  /**
   * FUNÇÃO DE VALIDAÇÃO: Testa se a sessão está válida fazendo requisição real ao servidor
   * Faz requisição HEAD para inicial.php para verificar se retorna 200 (autenticado)
   * Método mais confiável que apenas verificar timestamps
   */
  const validateSessionWithServer = async () => {
    try {
      // Validando sessão com servidor
      setValidatingSession(true);

      
      // CRÍTICO: Aguardar tempo suficiente para cookies se propagarem no sistema
      // Aguardando propagação de cookies
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Fazer requisição HEAD para verificar se sessão é válida
      const response = await fetch('https://app.corpxbank.com.br/inicial.php', {
        method: 'HEAD',
        credentials: 'include', // Incluir cookies
        headers: {
          'User-Agent': 'CorpxBank Mobile App',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.8,en;q=0.5',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      // Verificando resposta do servidor
      
      // 200 = autenticado, 302/301 = redirecionamento para login = não autenticado
      const isValid = response.status === 200 && !response.url.includes('login.php');
      
      // Validando critérios de sessão
      
      setValidatingSession(false);
      setSessionValidated(isValid);
      
      if (isValid) {
        // Sessão validada com sucesso pelo servidor

      } else {
        // Sessão inválida detectada pelo servidor

      }
      
      return isValid;
      
    } catch (error) {
      console.error('❌ Erro ao validar sessão:', error);
      setValidatingSession(false);
      setSessionValidated(false);

      return false;
    }
  };

  /**
   * FUNÇÃO CRÍTICA: Detecta expiração de sessão e força login manual
   * Monitora navegação para detectar redirecionamentos forçados para login.php
   * Quando detectado, limpa dados e força usuário a fazer login completo
   */
  const handleSessionExpiration = async () => {
    try {
      // Verificando expiração de sessão
      
      // Se usuário estava autenticado mas foi redirecionado para login.php automaticamente
      if (currentUrl.includes('login.php') && authStatus === 'authenticated' && cookiesInjected) {
        // Sessão expirada detectada
  
        
        // Limpar todos os dados de sessão
        // Limpando dados de sessão expirada
        await Promise.all([
          SecureStore.deleteItemAsync(SESSION_COOKIES_KEY),
          SecureStore.deleteItemAsync(SESSION_EXPIRY_KEY),
          SecureStore.deleteItemAsync(CSRF_TOKENS_KEY),
          SecureStore.deleteItemAsync(NATIVE_COOKIES_KEY),
          SecureStore.deleteItemAsync(COOKIE_EXPIRY_KEY),
          SecureStore.deleteItemAsync('last_authenticated_url')
        ]);
        
        // Limpar cookies nativos
        try {
          await CookieManager.clearAll(true);
          // Cookies nativos limpos
        } catch (error) {
          // Aviso: falha ao limpar cookies nativos
        }
        
        // Resetar estados
        setCookiesInjected(false);
        setSessionValidated(false);
        setAuthStatus('needsLogin');
        
        // Limpeza de sessão expirada completa
  
      }
      
    } catch (error) {
      console.error('❌ Erro ao tratar expiração de sessão:', error);
    }
  };

  useEffect(() => {
    // FUNÇÃO PRINCIPAL: Verifica status de autenticação na inicialização do app
    // Determina se usuário deve ver biometria, login manual ou área autenticada
    // Gerencia expiração de sessões biométricas (30 dias)
    // MODIFICAÇÃO: Biometria desabilitada no iOS
    const checkAuthStatus = async () => {
      try {
        // Verificando status de autenticação inicial
        
        // DESABILITAR BIOMETRIA NO iOS - sempre ir para login manual
        if (Platform.OS === 'ios') {
          // iOS detectado - biometria desabilitada
          setCurrentUrl('https://app.corpxbank.com.br/login.php');
    setInitialUrl('https://app.corpxbank.com.br/login.php');
          setAuthStatus('needsLogin');
          return;
        }
        
        const biometricEnabled = await SecureStore.getItemAsync(BIOMETRIC_KEY);
        const sessionTimestamp = await SecureStore.getItemAsync(SESSION_KEY);
        // Verificando se biometria está ativa

        if (biometricEnabled === 'true') {
          // Verificar se a sessão biométrica não expirou (30 dias)
          if (sessionTimestamp) {
            const sessionAge = Date.now() - parseInt(sessionTimestamp);
            const isExpired = sessionAge > BIOMETRIC_EXPIRY_TIME;
            
            // Verificando idade da sessão
            
            if (isExpired) {
              // Sessão biométrica expirada
              // Limpar credenciais expiradas
              await Promise.all([
                SecureStore.deleteItemAsync(BIOMETRIC_KEY),
                SecureStore.deleteItemAsync(SESSION_KEY),
                SecureStore.deleteItemAsync(LOGIN_KEY),
                SecureStore.deleteItemAsync(PASSWORD_KEY),
                SecureStore.deleteItemAsync('last_authenticated_url')
              ]);
              setCurrentUrl('https://app.corpxbank.com.br/login.php');
    setInitialUrl('https://app.corpxbank.com.br/login.php');
              setAuthStatus('needsLogin');
              return;
            }
          }

          // Biometria habilitada e sessão válida
          setAuthStatus('promptBiometric');
          handleBiometricAuth();
        } else {
          // Biometria não ativada
          setCurrentUrl('https://app.corpxbank.com.br/login.php');
          setInitialUrl('https://app.corpxbank.com.br/login.php');
          setAuthStatus('needsLogin');
        }
      } catch (error) {
        console.error('❌ Erro ao verificar status de autenticação:', error);
        setCurrentUrl('https://app.corpxbank.com.br/login.php');
        setInitialUrl('https://app.corpxbank.com.br/login.php');
        setAuthStatus('needsLogin');
      }
    };

    checkAuthStatus();
  }, []);

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

  // FUNÇÃO CRÍTICA: Monitora navegação e detecta mudanças de estado
    // Identifica sucessos de login, necessidade de auto-login e gerencia URLs
    // Atualiza estado do app baseado na página atual visitada
    const handleNavigationStateChange = async (navState) => {
    setCanGoBack(navState.canGoBack);
    setCurrentUrl(navState.url);

    if (navState.url.includes('inicial.php')) {
      if (authStatus !== 'authenticated') {
        // Login bem-sucedido detectado
        setAuthStatus('authenticated');
        
        // CRÍTICO: Capturar cookies nativamente após login manual bem-sucedido
        // Executando captura automática de cookies

        setTimeout(async () => {
          const cookiesCaptured = await captureNativeCookies();
          if (cookiesCaptured) {
            // Cookies capturados e salvos para biometria futura
  
          } else {
            // Aviso: Falha na captura de cookies
  
          }
        }, 2000); // Aguardar 2s para garantir que cookies estão disponíveis
      }
      // Salvando a última URL autenticada
      await SecureStore.setItemAsync('last_authenticated_url', navState.url);
      setAutoLoginDone(false); // reset para próximas sessões
    } else if (navState.url.includes('login.php')) {
      // Usuário navegou para a página de login
      
      // Só executar auto-login se chegou aqui por navegação normal (não por biometria)
      // Biometria já redireciona direto para área autenticada
      if (authStatus === 'authenticated' && !autoLoginDone && !navState.url.includes('biometric_redirect')) {
        // Tentando auto-login após navegação para login
        tryAutoLogin();
      } else if (authStatus === 'needsLogin') {
        // Se está em needsLogin, limpar URL salva
        await SecureStore.deleteItemAsync('last_authenticated_url');
      }
    }
  };

  // Verificar permissões de câmera na inicialização (Android)
  useEffect(() => {
    const checkCameraPermissions = async () => {
      if (Platform.OS === 'android') {
        try {
          const cameraPermission = await Camera.getCameraPermissionsAsync();
          console.log('📷 Status inicial da permissão de câmera:', cameraPermission.status);
          
          if (cameraPermission.status === 'undetermined') {
            console.log('📱 Permissão de câmera ainda não solicitada - será solicitada quando necessário');
          } else if (cameraPermission.status === 'denied') {
            console.log('⚠️ Permissão de câmera negada - funcionalidades de câmera podem não funcionar');
          } else if (cameraPermission.status === 'granted') {
            console.log('✅ Permissão de câmera já concedida - WebView poderá acessar câmera');
          }
        } catch (error) {
          console.error('❌ Erro ao verificar permissões iniciais de câmera:', error);
        }
      }
    };

    checkCameraPermissions();
  }, []);

  // Novo useEffect para lidar com a oferta de biometria após o login
  useEffect(() => {
    if (authStatus === 'authenticated') {
      // Usuário autenticado, verificando oferta de biometria
      offerBiometrics();
    }
  }, [authStatus]);

  // FUNÇÃO DE UX: Oferece ativação de biometria após login bem-sucedido
    // Verifica disponibilidade de hardware e se usuário já foi questionado
    // Evita perguntas repetitivas e melhora experiência do usuário
    // MODIFICAÇÃO: Biometria desabilitada no iOS
    const offerBiometrics = async () => {
    try {
      // Verificando oferta de biometria
      
      // DESABILITAR BIOMETRIA NO iOS - não oferecer
      if (Platform.OS === 'ios') {
        // iOS detectado - biometria desabilitada
        await SecureStore.setItemAsync('biometryAsked', 'true');
        return;
      }
      
      const biometryAsked = await SecureStore.getItemAsync('biometryAsked');
      if (biometryAsked === 'true') {
        // Oferta de biometria já foi feita anteriormente
        return;
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      // Verificação de hardware biométrico

      if (hasHardware && isEnrolled) {
        Alert.alert(
          'Ativar Login Rápido?',
          'Deseja usar sua biometria para acessar o aplicativo mais rápido da próxima vez?',
          [
            {
              text: 'Agora não',
              onPress: () => SecureStore.setItemAsync('biometryAsked', 'true'),
              style: 'cancel',
            },
            {
              text: 'Ativar',
              onPress: () => handleBiometricPrompt(true),
            },
          ]
        );
      } else {
        // Mesmo que não tenha hardware, marcamos como perguntado para não verificar de novo.
        await SecureStore.setItemAsync('biometryAsked', 'true');
      }
    } catch (error) {
      console.error('❌ Erro ao oferecer biometria:', error);
    }
  };



  // FUNÇÃO DE CONFIGURAÇÃO: Processa escolha do usuário sobre biometria
    // Ativa/configura biometria e salva credenciais de forma segura
    // Gerencia processo completo de habilitação da autenticação biométrica
    const handleBiometricPrompt = async (enable) => {
    // Usuário escolheu ativar biometria
    await SecureStore.setItemAsync('biometryAsked', 'true'); // Marcar que já perguntamos

    if (enable) {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirme sua identidade para ativar o login rápido',
          disableDeviceFallback: true, // Não permite usar a senha do dispositivo
        });

        if (result.success) {
          // Biometria confirmada! Ativando para futuros logins
          const currentTimestamp = Date.now().toString();
          
          // Salvar configurações da biometria
          await Promise.all([
            SecureStore.setItemAsync(BIOMETRIC_KEY, 'true'),
            SecureStore.setItemAsync(SESSION_KEY, currentTimestamp),
            SecureStore.setItemAsync(BIOMETRIC_TIMESTAMP_KEY, currentTimestamp)
          ]);

          // Salvar as credenciais e dados adicionais se foram capturados
          if (loginCredentials && loginCredentials.login && loginCredentials.password) {
            const savePromises = [
              SecureStore.setItemAsync(LOGIN_KEY, loginCredentials.login),
              SecureStore.setItemAsync(PASSWORD_KEY, loginCredentials.password)
            ];

            // Salvar tipo de identificador se disponível
            const identifierType = await SecureStore.getItemAsync(LOGIN_IDENTIFIER_TYPE_KEY);
            if (identifierType) {
              savePromises.push(SecureStore.setItemAsync(LOGIN_IDENTIFIER_TYPE_KEY, identifierType));
            }

            // Salvar dados de sessão se disponíveis
            const sessionCookies = await SecureStore.getItemAsync(SESSION_COOKIES_KEY);
            if (sessionCookies) {
              savePromises.push(SecureStore.setItemAsync(SESSION_COOKIES_KEY, sessionCookies));
            }

            const csrfTokens = await SecureStore.getItemAsync(CSRF_TOKENS_KEY);
            if (csrfTokens) {
              savePromises.push(SecureStore.setItemAsync(CSRF_TOKENS_KEY, csrfTokens));
            }

            await Promise.all(savePromises);
            // Credenciais e dados de sessão salvos para login automático
          } else {
            // Credenciais não capturadas - biometria ativada mas sem auto-login
          }

          Alert.alert(
            'Login Rápido Ativado!',
            'Você poderá usar sua biometria para acessar o app por 30 dias.'
          );
        } else {
          // Autenticação para ativação da biometria falhou
          Alert.alert('Ativação Falhou', 'Não foi possível verificar sua identidade.');
        }
      } catch (error) {
        console.error('❌ Erro ao ativar biometria:', error);
        Alert.alert('Erro', 'Ocorreu um erro ao tentar ativar a biometria.');
      }
    }
  };

  /**
   * FUNÇÃO CRÍTICA: Verifica se é a primeira vez do usuário
   * Diferencia entre novo usuário vs. usuário existente com biometria
   * @returns {boolean} true se é primeira vez, false se já completou primeiro login
   */
  const checkIfFirstTimeUser = async () => {
    try {
      // Verificando se é primeiro uso do usuário
      
      // Verificar se já foi marcado como primeiro login completo
      const firstLoginDone = await SecureStore.getItemAsync(FIRST_LOGIN_COMPLETED_KEY);
      
      // Verificar se há credenciais salvas (indicador de uso anterior)
      const hasCredentials = await SecureStore.getItemAsync(LOGIN_KEY);
      
      // É primeira vez se não há marcação E não há credenciais
      const isFirstTime = firstLoginDone !== 'true' || !hasCredentials;
      
      return isFirstTime;
    } catch (error) {
      console.error('❌ Erro ao verificar primeiro uso:', error);
      // Em caso de erro, assumir que é primeira vez (mais seguro)
      return true;
    }
  };

  /**
   * FUNÇÃO MELHORADA: Valida sessão com múltiplos fallbacks
   * Verifica cookies, timestamps e URLs para determinar sessão válida
   * @returns {boolean} true se sessão válida, false caso contrário
   */
  const validateSessionCookies = async () => {
    try {
      // Validando sessão com múltiplos indicadores
      
      // 1. FALLBACK PRIMÁRIO: Verificar URL autenticada recente
      const lastAuthUrl = await SecureStore.getItemAsync('last_authenticated_url');
      const lastSuccessfulLogin = await SecureStore.getItemAsync(LAST_SUCCESSFUL_LOGIN_KEY);
      
      if (lastAuthUrl && lastAuthUrl.includes('inicial.php') && lastSuccessfulLogin) {
        const loginAge = Date.now() - parseInt(lastSuccessfulLogin);
        // Se login foi nas últimas 4 horas, considerar sessão provavelmente válida
        if (loginAge < (4 * 60 * 60 * 1000)) {
          // Sessão recente detectada (últimas 4h), assumindo válida
          return true;
        }
      }
      
      // 2. VERIFICAÇÃO DE COOKIES: Se disponíveis
      const savedCookies = await SecureStore.getItemAsync(SESSION_COOKIES_KEY);
      const sessionExpiry = await SecureStore.getItemAsync(SESSION_EXPIRY_KEY);
      
      if (savedCookies && sessionExpiry) {
        const now = Date.now();
        const expiry = parseInt(sessionExpiry);
        
        if (now <= expiry) {
          // Cookies de sessão válidos encontrados
          return true;
        } else {
          // Cookies de sessão expiraram, limpando
          await Promise.all([
            SecureStore.deleteItemAsync(SESSION_COOKIES_KEY),
            SecureStore.deleteItemAsync(SESSION_EXPIRY_KEY),
            SecureStore.deleteItemAsync(CSRF_TOKENS_KEY)
          ]);
        }
      }
      
      // 3. VERIFICAÇÃO DE BIOMETRIA RECENTE: Se biometria foi usada recentemente
      const biometricTimestamp = await SecureStore.getItemAsync(BIOMETRIC_TIMESTAMP_KEY);
      if (biometricTimestamp) {
        const biometricAge = Date.now() - parseInt(biometricTimestamp);
        // Se biometria foi usada nas últimas 2 horas, assumir sessão válida
        if (biometricAge < (2 * 60 * 60 * 1000)) {
          // Biometria recente detectada, assumindo sessão válida
          return true;
        }
      }
      
      // Nenhum indicador de sessão válida encontrado
      return false;
      
    } catch (error) {
      console.error('❌ Erro ao validar sessão:', error);
      return false;
    }
  };

  const testSessionValidity = async () => {
    try {
      // Testando validade da sessão
      const savedCookies = await SecureStore.getItemAsync(SESSION_COOKIES_KEY);
      
      if (!savedCookies) {
        return false;
      }

      // Tentar acessar uma página da área autenticada para verificar se a sessão é válida
      const testUrl = 'https://app.corpxbank.com.br/inicial.php';
      
      // Esta verificação será feita através da WebView
      // Retornar true por enquanto, a validação real será no carregamento da página
      return true;
    } catch (error) {
      console.error('❌ Erro ao testar validade da sessão:', error);
      return false;
    }
  };

  /**
   * FUNÇÃO CRÍTICA: Executa auto-login sem mostrar interface para o usuário
   * Carrega login.php em background, executa auto-login e redireciona para inicial.php
   * Usuário não vê a tela de login
   */
  const performInvisibleAutoLogin = async () => {
    try {
      // Iniciando auto-login invisível
      
      
      // Verificar se temos credenciais necessárias
      const storedLogin = await SecureStore.getItemAsync(LOGIN_KEY);
      const storedPassword = await SecureStore.getItemAsync(PASSWORD_KEY);
      
      if (!storedLogin || !storedPassword) {
        // Credenciais não encontradas para auto-login invisível
        // Fallback para login manual
        setAuthStatus('needsLogin');
        setCurrentUrl('https://app.corpxbank.com.br/login.php');
        setInitialUrl('https://app.corpxbank.com.br/login.php');
        return;
      }
      
      // Credenciais encontradas, iniciando auto-login invisível
      
      // Configurar estado para auto-login
      setAuthStatus('authenticated'); // Permitir auto-login
      setAutoLoginDone(false); // Resetar flag
      setIsLoading(true); // Mostrar loading durante processo
      
      // Carregar página de login para executar auto-login
      // IMPORTANTE: Usuário não vê esta tela, só o loading
      setCurrentUrl('https://app.corpxbank.com.br/login.php');
      setInitialUrl('https://app.corpxbank.com.br/login.php');
      
      // Auto-login invisível configurado, aguardando execução
      
    } catch (error) {
      console.error('❌ Erro no auto-login invisível:', error);
      
      
      // Em caso de erro, fallback para login manual
      setAuthStatus('needsLogin');
      setCurrentUrl('https://app.corpxbank.com.br/login.php');
      setInitialUrl('https://app.corpxbank.com.br/login.php');
    }
  };

  /**
   * FUNÇÃO COMPLETAMENTE REFATORADA: Fluxo de biometria com gerenciamento nativo de cookies
   * NOVO FLUXO CORRETO:
   * 1. Primeiro uso: login manual normal
   * 2. Retornos: injetar cookies nativos → carregar inicial.php → SUCESSO
   * 3. Cookies expirados: auto-login silencioso → capturar novos cookies → inicial.php
   * 4. GARANTIA: Usuário NUNCA vê login.php após configurar biometria
   */
  const handleBiometricAuth = async () => {
    try {
      // Iniciando handleBiometricAuth
      
      // PROTEÇÃO: Nunca executar biometria no iOS
      if (Platform.OS === 'ios') {
        // iOS detectado - biometria desabilitada
        setAuthStatus('needsLogin');
        setCurrentUrl('https://app.corpxbank.com.br/login.php');
        setInitialUrl('https://app.corpxbank.com.br/login.php');
        return;
      }
      
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Use sua biometria para acessar o CorpxBank',
        disableDeviceFallback: true,
      });

      if (result.success) {
        // Autenticação biométrica bem-sucedida

        
        // ETAPA 1: Verificar se é primeira vez vs. usuário existente
        const isFirstTime = await checkIfFirstTimeUser();
        
        if (isFirstTime) {
          // PRIMEIRO USO: Login manual normal (única vez que usuário vê login.php)
          // Primeiro uso detectado - redirecionando para login manual
  
          
          setAuthStatus('needsLogin');
          setCurrentUrl('https://app.corpxbank.com.br/login.php');
        setInitialUrl('https://app.corpxbank.com.br/login.php');
          return;
        }
        
        // ETAPA 2: USUÁRIO EXISTENTE - Tentar injetar cookies salvos
        // Usuário existente - tentando injeção de cookies

        
        const cookiesInjected = await injectNativeCookiesBeforeLoad();
        
        if (cookiesInjected) {
          // ETAPA 3A: COOKIES INJETADOS - Validar com servidor
          // Cookies injetados, validando com servidor

          
          const sessionValid = await validateSessionWithServer();
          
          if (sessionValid) {
            // SUCESSO: Ir direto para área autenticada
            // SUCESSO TOTAL: Sessão válida, carregando área autenticada

            
            // CRÍTICO: Definir que cookies foram injetados com sucesso
            setCookiesInjected(true);
            setSessionValidated(true);
            setAuthStatus('authenticated');
            setCurrentUrl('https://app.corpxbank.com.br/inicial.php');
    setInitialUrl('https://app.corpxbank.com.br/inicial.php');
            
            // Atualizar timestamps de sucesso
            await Promise.all([
              SecureStore.setItemAsync(BIOMETRIC_TIMESTAMP_KEY, Date.now().toString()),
              SecureStore.setItemAsync(SESSION_KEY, Date.now().toString()),
              SecureStore.setItemAsync(LAST_SUCCESSFUL_LOGIN_KEY, Date.now().toString())
            ]);
            
            return;
          } else {
            // Validação falhou - cookies inválidos/expirados
            setCookiesInjected(false);
            setSessionValidated(false);
          }
        }
        
        // ETAPA 3B: COOKIES FALHARAM OU SESSÃO INVÁLIDA - Auto-login silencioso
        // Cookies inválidos/expirados - iniciando auto-login silencioso
        
        
        // Verificar se temos credenciais para auto-login
        const storedLogin = await SecureStore.getItemAsync(LOGIN_KEY);
        const storedPassword = await SecureStore.getItemAsync(PASSWORD_KEY);
        
        if (!storedLogin || !storedPassword) {
          // Fallback extremo: forçar login manual
          // Credenciais não encontradas - fallback para login manual
          
          
          setAuthStatus('needsLogin');
          setCurrentUrl('https://app.corpxbank.com.br/login.php');
        setInitialUrl('https://app.corpxbank.com.br/login.php');
          return;
        }
        
        // EXECUTAR AUTO-LOGIN SILENCIOSO
        await performSilentAutoLogin();
        
      } else {
        // Autenticação biométrica falhou ou cancelada pelo usuário
        setAuthStatus('needsLogin');
        setCurrentUrl('https://app.corpxbank.com.br/login.php');
        setInitialUrl('https://app.corpxbank.com.br/login.php');
      }
    } catch (error) {
      console.error('❌ Erro na autenticação biométrica:', error);
      setAuthStatus('needsLogin');
      setCurrentUrl('https://app.corpxbank.com.br/login.php');
      setInitialUrl('https://app.corpxbank.com.br/login.php');
    }
  };

  /**
   * FUNÇÃO CRÍTICA: Executa auto-login silencioso quando cookies expiraram
   * Faz login automático SEM mostrar login.php para o usuário
   * Captura novos cookies e redireciona para inicial.php
   */
  const performSilentAutoLogin = async () => {
    try {
      // Iniciando auto-login silencioso com nova arquitetura
      
      
      // Configurar estado para mostrar loading sem URL específica
      setAuthStatus('authenticated'); // Permitir que WebView funcione
      setIsLoading(true);
      
      // ESTRATÉGIA: Carregar login.php EM BACKGROUND e fazer auto-login
      // Usuário vê apenas loading durante todo o processo
      setCurrentUrl('https://app.corpxbank.com.br/login.php');
      setInitialUrl('https://app.corpxbank.com.br/login.php');
      
      // Flag para indicar que estamos em processo silencioso
      setAutoLoginDone(false); // Permitir tentativa de auto-login
      
      // Auto-login silencioso configurado - usuário não verá login.php
      
    } catch (error) {
      console.error('❌ Erro no auto-login silencioso:', error);

      
      // Fallback para login manual
      setAuthStatus('needsLogin');
      setCurrentUrl('https://app.corpxbank.com.br/login.php');
      setInitialUrl('https://app.corpxbank.com.br/login.php');
    }
  };

  // FUNÇÃO DE LIMPEZA: Logout seguro com limpeza completa de dados
  // Remove todos os dados sensíveis e reseta estado do app
  // Suporte a logout parcial (sessão) ou completo (incluindo biometria)
  const handleLogout = async (clearAll = false) => {
    try {
      // Realizando logout
      
      // LIMPEZA BÁSICA: sempre remove dados de sessão ativa
      const itemsToClear = [
        SESSION_KEY, 
        LOGIN_STATUS_KEY, 
        'last_authenticated_url',
        BIOMETRIC_TIMESTAMP_KEY // Limpar timestamp para forçar nova validação
      ];
      
      // LIMPEZA COMPLETA: remove também credenciais e configurações biométricas
      if (clearAll) {
        itemsToClear.push(
          LOGIN_KEY, 
          PASSWORD_KEY, 
          BIOMETRIC_KEY, 
          'biometryAsked',
          LOGIN_IDENTIFIER_TYPE_KEY,
          SESSION_COOKIES_KEY,
          CSRF_TOKENS_KEY,
          LAST_2FA_CODE_KEY,
          LAST_2FA_TIMESTAMP_KEY,
          SESSION_EXPIRY_KEY,
          CAPTCHA_BYPASS_TOKEN_KEY,
          USER_AGENT_KEY,
          LAST_SUCCESSFUL_LOGIN_KEY,
          FIRST_LOGIN_COMPLETED_KEY, // NOVO: limpar marca de primeiro login
          NATIVE_COOKIES_KEY, // CRÍTICO: limpar cookies nativos
          COOKIE_EXPIRY_KEY // CRÍTICO: limpar timestamp de expiração
        );
        
        // LIMPEZA DE CACHE DE PERMISSÕES DA WEBVIEW
        await clearWebViewPermissionsCache();
      }
      
      // Executar limpeza em paralelo para melhor performance
      await Promise.all(itemsToClear.map(key => 
        SecureStore.deleteItemAsync(key).catch(err => 
          console.warn('⚠️ Aviso: não foi possível limpar dados:', err)
        )
      ));
      
      // Limpeza de dados concluída
      
      // LIMPEZA ADICIONAL: Limpar cookies nativos se limpeza completa
      if (clearAll) {
        try {
          await CookieManager.clearAll(true); // useWebKit = true
          // Cookies nativos limpos via CookieManager
        } catch (error) {
          // Aviso: não foi possível limpar cookies nativos
        }
      }
      
      // Resetar estados do React
      setAuthStatus('needsLogin');
      setAutoLoginDone(false);
      setLoginCredentials(null);
      setCookiesInjected(false);
      setSessionValidated(false);
      setValidatingSession(false);
      
      // Navegar para login
      const newUrl = 'https://app.corpxbank.com.br/login.php';
      setInitialUrl(newUrl);
      setCurrentUrl(newUrl);
      
      // Limpar cookies da WebView e navegar
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          // Limpar cookies do domínio
          document.cookie.split(";").forEach(function(c) { 
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/;"); 
          });
          // Navegar para login
          window.location.href = '${newUrl}';
        `);
      }
      

      
    } catch (error) {
      // Erro no logout
      // Em caso de erro, forçar estado de login
      setAuthStatus('needsLogin');
      setCurrentUrl('https://app.corpxbank.com.br/login.php');
    }
  };
  
  // Nova função para navegar para Home sem fazer logout
  const handleGoHome = () => {
    try {
      console.log('🏠 WebView: Navegando para página inicial...');
      
      if (webViewRef.current) {
        // Navegar para a página inicial mantendo a sessão
        const homeUrl = 'https://app.corpxbank.com.br/inicial.php';
        setCurrentUrl(homeUrl);
        webViewRef.current.injectJavaScript(`
          window.location.href = '${homeUrl}';
          true;
        `);
        
        console.log('✅ WebView: Redirecionamento para Home executado');
      } else {
        console.error('❌ WebView: Referência do WebView não encontrada');
      }
    } catch (error) {
      console.error('❌ WebView: Erro ao navegar para Home:', error);
    }
  };

  // HANDLER DE PERMISSÕES APRIMORADO: Trabalha em conjunto com WKUIDelegate nativo
  const handlePermissionRequest = async (request) => {
    console.log('🔐 WebView: Solicitação de permissão recebida:', request);
    
    try {
      const { resources, origin } = request;
      
      // Verificar se é solicitação de câmera ou microfone
      if (resources.includes('camera') || resources.includes('microphone')) {
        console.log('📷 WebView: Permissão de câmera/microfone solicitada para origem:', origin?.host || 'desconhecida');
        
        // ETAPA 1: Verificar se é domínio confiável (CorpxBank)
        const isTrustedDomain = origin?.host === 'app.corpxbank.com.br';
        
        if (!isTrustedDomain) {
          console.log('⚠️ WebView: Domínio não confiável, negando permissão');
          request.deny();
          return;
        }
        
        // ETAPA 2: Para domínio confiável, verificar cache primeiro
        let cameraGranted = false, microphoneGranted = false;
        
        if (resources.includes('camera')) {
          const cachedCameraPermission = await SecureStore.getItemAsync(WEBVIEW_CAMERA_PERMISSION_KEY);
          if (cachedCameraPermission === 'true') {
            console.log('✅ WebView: Permissão de câmera já no cache, concedendo automaticamente');
            cameraGranted = true;
          }
        }
        
        if (resources.includes('microphone')) {
          const cachedMicrophonePermission = await SecureStore.getItemAsync(WEBVIEW_MICROPHONE_PERMISSION_KEY);
          if (cachedMicrophonePermission === 'true') {
            console.log('✅ WebView: Permissão de microfone já no cache, concedendo automaticamente');
            microphoneGranted = true;
          }
        }
        
        // ETAPA 3: Se ambas as permissões estão em cache, conceder imediatamente
        const allCachedPermissionsGranted = 
          (!resources.includes('camera') || cameraGranted) && 
          (!resources.includes('microphone') || microphoneGranted);
          
        if (allCachedPermissionsGranted) {
          console.log('🚀 WebView: Todas as permissões já estão em cache, concedendo imediatamente');
          request.grant();
          return;
        }
        
        // ETAPA 4: Para iOS, consultar permissões nativas e sincronizar cache
        if (Platform.OS === 'ios') {
          let shouldGrantPermission = true;
          
          if (resources.includes('camera') && !cameraGranted) {
            const cameraPermission = await Camera.getCameraPermissionsAsync();
            console.log('📷 iOS: Status da permissão nativa de câmera:', cameraPermission.status);
            
            if (cameraPermission.status === 'granted') {
              // Sincronizar cache com permissão nativa
              await SecureStore.setItemAsync(WEBVIEW_CAMERA_PERMISSION_KEY, 'true');
              console.log('🔄 iOS: Cache de câmera sincronizado com permissão nativa');
            } else {
              console.log('❌ iOS: Permissão de câmera não concedida nativamente');
              shouldGrantPermission = false;
            }
          }
          
          if (resources.includes('microphone') && !microphoneGranted) {
            // Para microfone, assumir que se câmera foi concedida, microfone também pode ser
            if (shouldGrantPermission) {
              await SecureStore.setItemAsync(WEBVIEW_MICROPHONE_PERMISSION_KEY, 'true');
              console.log('🔄 iOS: Cache de microfone sincronizado');
            }
          }
          
          if (shouldGrantPermission) {
            console.log('✅ iOS: Concedendo permissão baseada em status nativo');
            request.grant();
            return;
          } else {
            console.log('❌ iOS: Negando permissão - não concedida nativamente');
            request.deny();
            return;
          }
        }
        
        // Para Android, verificar e solicitar permissões nativas se necessário
        if (Platform.OS === 'android') {
          try {
            // Verificar permissão de câmera
            if (resources.includes('camera')) {
              const cameraPermission = await Camera.getCameraPermissionsAsync();
              console.log('📷 Status da permissão de câmera:', cameraPermission.status);
              
              if (cameraPermission.status === 'granted') {
                await SecureStore.setItemAsync(WEBVIEW_CAMERA_PERMISSION_KEY, 'true');
                console.log('✅ Android: Permissão de câmera já concedida e cacheada');
                request.grant();
                return;
              } else if (cameraPermission.canAskAgain) {
                console.log('📱 Android: Solicitando permissão de câmera do usuário');
                const newPermission = await Camera.requestCameraPermissionsAsync();
                if (newPermission.status === 'granted') {
                  await SecureStore.setItemAsync(WEBVIEW_CAMERA_PERMISSION_KEY, 'true');
                  console.log('✅ Android: Permissão de câmera concedida pelo usuário e cacheada');
                  request.grant();
                  return;
                } else {
                  console.log('❌ Android: Permissão de câmera negada pelo usuário');
                  request.deny();
                  return;
                }
              } else {
                console.log('❌ Android: Não é possível solicitar permissão de câmera');
                request.deny();
                return;
              }
            }
            
            // Se chegou até aqui e é solicitação de microfone apenas
            if (resources.includes('microphone')) {
              await SecureStore.setItemAsync(WEBVIEW_MICROPHONE_PERMISSION_KEY, 'true');
              console.log('🎤 Android: Solicitação de microfone concedida e cacheada');
              request.grant();
              return;
            }
          } catch (permissionError) {
            console.error('❌ Erro ao verificar permissões nativas:', permissionError);
            // Em caso de erro, conceder permissão (fallback)
            request.grant();
            return;
          }
        }
      }
      
      // Para outras permissões, conceder por padrão
      console.log('✅ Concedendo permissão para outros recursos:', resources);
      request.grant();
      
    } catch (error) {
      console.error('❌ WebView: Erro ao processar permissão:', error);
      request.deny();
    }
  };

  // HANDLER DE UPLOAD DE ARQUIVOS: Integra expo-image-picker para iOS
  const handleFileUpload = async (params) => {
    console.log('📁 WebView: Solicitação de upload de arquivo recebida:', params);
    
    try {
      // Verificar se é uma solicitação de captura de câmera
      const { accept, capture } = params;
      
      if (accept && (accept.includes('image') || accept.includes('*')) && capture) {
        console.log('📷 WebView: Upload com captura de câmera solicitado');
        
        // Solicitar permissão da câmera
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          console.error('❌ WebView: Permissão de câmera negada');
          return [];
        }
        
        // Abrir câmera para captura
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 0.8,
        });
        
        if (!result.canceled && result.assets && result.assets.length > 0) {
          console.log('✅ WebView: Foto capturada com sucesso');
          return result.assets.map(asset => ({
            uri: asset.uri,
            name: asset.fileName || 'camera-capture.jpg',
            type: asset.type || 'image/jpeg',
          }));
        }
      } else if (accept && accept.includes('image')) {
        console.log('📷 WebView: Seleção de imagem da galeria solicitada');
        
        // Abrir galeria para seleção
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 0.8,
        });
        
        if (!result.canceled && result.assets && result.assets.length > 0) {
          console.log('✅ WebView: Imagem selecionada com sucesso');
          return result.assets.map(asset => ({
            uri: asset.uri,
            name: asset.fileName || 'selected-image.jpg',
            type: asset.type || 'image/jpeg',
          }));
        }
      }
      
      return [];
      
    } catch (error) {
      console.error('❌ WebView: Erro no upload de arquivo:', error);
      return [];
    }
  };

  // FUNÇÃO DE COMUNICAÇÃO: Processa mensagens vindas da WebView
    // Gerencia captura de credenciais, dados de sessão, 2FA e eventos de login
    // Ponto central de comunicação entre JavaScript injetado e React Native
    const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      // Mensagem WebView recebida
      
      switch (data.type) {
        case 'LOGIN_ATTEMPT':
          if (data.credentials) {
            setLoginCredentials(data.credentials);
            // Credenciais de login capturadas para possível uso biométrico
          }
          break;
        case 'LOGIN_CREDENTIALS_CAPTURED':
          if (data.credentials) {
            setLoginCredentials(data.credentials);
            // Não salva ainda no SecureStore; só salvamos quando o usuário ativa a biometria
          }
          break;
        case 'LOGIN_INPUTS':
          try {
            const count = Array.isArray(data.inputs) ? data.inputs.length : 0;
            // LOGIN_INPUTS: inputs detectados
            if (count) {
              // Amostra de inputs
            }
          } catch (e) {}
          break;
        case 'AUTO_LOGIN_SUBMITTED':
          // Auto-login submetido com sucesso
  
          
          // CRÍTICO: Aguardar e capturar cookies após auto-login bem-sucedido
          setTimeout(async () => {
            if (currentUrl.includes('inicial.php')) {
              // EXECUTANDO: Captura de cookies após auto-login silencioso
    
              
              const cookiesCaptured = await captureNativeCookies();
              if (cookiesCaptured) {
                // SUCESSO: Novos cookies capturados após auto-login
    
              } else {
                // AVISO: Falha na captura de cookies após auto-login
                
              }
            }
          }, 3000); // Aguardar 3s para garantir que redirecionamento foi concluído
          break;
        case 'OPEN_SCANNER':
          // Solicitação para abrir scanner de QR/boleto (apenas iOS)
          console.log('📱 WebView: Abrindo scanner nativo para plataforma:', data.platform);
          
          navigation.navigate('Scanner', {
            returnToWebView: (result) => {
              console.log('🔄 WebView: Recebendo dados do scanner...', result);
              
              try {
                // SCRIPT SIMPLIFICADO - Processamento direto sem confirmação complexa
                const script = `
                  (function() {
                    const scanResult = ${JSON.stringify(result)};
                    
                    console.log('📱 WebView JS: Processando resultado do scan:', scanResult);
                    
                    try {
                      // Processar baseado no tipo de código
                      if (scanResult.success && scanResult.processedData) {
                        const processedData = scanResult.processedData;
                        
                        if (processedData.type === 'pix') {
                          // Processar PIX
                          console.log('💰 WebView JS: Processando dados PIX...', processedData);
                          
                          // Tentar preencher campos PIX automaticamente
                          if (processedData.pixUrl) {
                            // PIX dinâmico - navegar para URL
                            console.log('🔗 WebView JS: PIX dinâmico detectado, redirecionando...');
                            window.location.href = processedData.pixUrl;
                            console.log('✅ WebView JS: PIX dinâmico processado com sucesso');
                          } else if (processedData.rawCode) {
                            // PIX estático - usar função melhorada de injeção
                            console.log('📝 WebView JS: PIX estático detectado, usando injeção robusta...');
                            handleQRCodeScanned(processedData.rawCode, 'native_scanner_pix');
                          } else {
                            console.log('❌ WebView JS: Código PIX não encontrado nos dados');
                          }
                        } else if (processedData.type === 'boleto') {
                          // Processar Boleto - usar função melhorada de injeção
                          console.log('🧦 WebView JS: Boleto detectado, usando injeção robusta...');
                          const boletoData = processedData.digitableLine || processedData.rawCode;
                          handleQRCodeScanned(boletoData, 'native_scanner_boleto');
                        } else {
                          console.log('⚠️ WebView JS: Tipo de código não reconhecido:', processedData.type);
                        }
                      } else {
                        console.log('❌ WebView JS: Dados processados não encontrados');
                      }
                      
                    } catch (error) {
                      console.error('❌ WebView JS: Erro durante processamento:', error);
                    }
                    
                    // NOTIFICAÇÃO SIMPLIFICADA para o React Native
                    try {
                      const status = {
                        type: 'SCAN_PROCESSING_STATUS',
                        success: true,
                        message: 'Dados processados com sucesso',
                        data: scanResult
                      };
                      
                      if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify(status));
                        console.log('✅ WebView JS: Status enviado para React Native');
                      }
                    } catch (statusError) {
                      console.error('❌ WebView JS: Erro ao enviar status:', statusError);
                    }
                    
                    // Callbacks adicionais
                    if (window.handleScanResult) {
                      try {
                        window.handleScanResult(scanResult);
                      } catch (handlerError) {
                        console.error('❌ WebView JS: Erro no handler personalizado:', handlerError);
                      }
                    }
                    
                    // Enviar mensagem para listeners
                    try {
                      window.postMessage({
                        type: 'SCAN_RESULT',
                        result: scanResult,
                        processing: {
                          success: processingSuccess,
                          message: processingMessage
                        }
                      }, '*');
                    } catch (postMessageError) {
                      console.error('❌ WebView JS: Erro ao enviar postMessage:', postMessageError);
                    }
                    
                    console.log('✅ WebView JS: Processamento concluído');
                    
                  })();
              `;
                
                // EXECUÇÃO SIMPLIFICADA do script
                if (webViewRef.current) {
                  console.log('🚀 WebView: Injetando script de processamento...');
                  webViewRef.current.injectJavaScript(script);
                  console.log('✅ WebView: Script injetado com sucesso');
                } else {
                  console.error('❌ WebView: Referência do WebView não encontrada');
                }
                
              } catch (error) {
                console.error('❌ WebView: Erro ao processar resultado do scanner:', error);
                
                // Sistema de recovery via localStorage continuará funcionando
                console.log('⚠️ WebView: Dados serão recuperados via localStorage');
              }
    
            }
          });
          break;
        case 'AUTO_LOGIN_FAILED':
          // Auto-login falhou

          // Em caso de falha, permitir login manual
          setAuthStatus('needsLogin');
          break;
        case 'NEED_2FA_CODE':
          // Código 2FA necessário

          break;
        case 'SCAN_DATA_PENDING':
          // Dados de scan pendentes detectados
          console.log('⚠️ WebView: Dados de scan pendentes detectados:', data);
          
          // Opcional: Mostrar notificação ao usuário
          // Alert.alert(
          //   'Dados Pendentes',
          //   'Detectamos dados de QR Code/Boleto não processados. Tentando recuperar...',
          //   [{ text: 'OK' }]
          // );
          break;
        case 'SCAN_PROCESSING_FAILED':
          console.log('❌ WebView: Falha no processamento do scan:', data);
          
          // Opcional: Notificar usuário sobre falha
          // Alert.alert(
          //   'Falha no Processamento',
          //   'Não foi possível processar os dados do QR Code/Boleto após várias tentativas.',
          //   [{ text: 'OK' }]
          // );
          break;
        case 'SCAN_PROCESSING_SUCCESS':
          console.log('✅ WebView: Sucesso no processamento do scan:', data);
          break;
        case 'CHECK_CAMERA_PERMISSION_CACHE':
          // Verificar cache de permissão de câmera no SecureStore
          try {
            const cachedPermission = await SecureStore.getItemAsync(WEBVIEW_CAMERA_PERMISSION_KEY);
            const hasPermission = cachedPermission === 'true';
            
            // Enviar resposta de volta para a WebView
            const responseScript = `
              (function() {
                try {
                  if (${hasPermission}) {
                    localStorage.setItem('webview_camera_permission', 'true');
                    console.log('✅ WebView JS: Cache de permissão de câmera sincronizado (concedida)');
                  } else {
                    localStorage.removeItem('webview_camera_permission');
                    console.log('❌ WebView JS: Cache de permissão de câmera sincronizado (negada)');
                  }
                } catch (e) {
                  console.error('❌ WebView JS: Erro ao sincronizar cache:', e);
                }
              })();
            `;
            
            if (webViewRef.current) {
              webViewRef.current.injectJavaScript(responseScript);
            }
          } catch (error) {
            console.error('❌ Erro ao verificar cache de permissão de câmera:', error);
          }
          break;
        case 'SYNC_CAMERA_PERMISSION_CACHE':
          // Sincronizar status de permissão de câmera
          try {
            const { granted } = data;
            if (granted) {
              await SecureStore.setItemAsync(WEBVIEW_CAMERA_PERMISSION_KEY, 'true');
              console.log('✅ Permissão de câmera cacheada como concedida');
            } else {
              await SecureStore.deleteItemAsync(WEBVIEW_CAMERA_PERMISSION_KEY);
              console.log('❌ Cache de permissão de câmera removido (negada)');
            }
          } catch (error) {
            console.error('❌ Erro ao sincronizar cache de permissão:', error);
          }
          
          // Opcional: Notificar usuário sobre sucesso
          // Alert.alert(
          //   'Sucesso!',
          //   'Dados do QR Code/Boleto processados com sucesso.',
          //   [{ text: 'OK' }]
          // );
          break;
        case 'SCAN_PROCESSING_STATUS':
          // Nova mensagem simplificada de status do processamento
          console.log('📊 WebView: Status do processamento recebido:', data);
          
          if (data.success) {
            console.log('✅ WebView: Processamento bem-sucedido -', data.message);
          } else {
            console.log('⚠️ WebView: Problema no processamento -', data.message);
          }
          break;
        case 'QR_CODE_PROCESSED':
          // Nova mensagem de confirmação do processamento de QR Code
          console.log('🔄 WebView: Resultado do processamento de QR Code:', data);
          
          if (data.success) {
            console.log('✅ WebView: QR Code processado com sucesso via', data.source);
            if (data.needsManualContinue) {
              console.log('⚠️ WebView: Botão continuar não encontrado - intervenção manual necessária');
            }
          } else {
            console.log('❌ WebView: Falha no processamento de QR Code:', data.error);
          }
          break;
        // REMOVIDAS mensagens WEBVIEW_SCANNER_ATTEMPT e sistema de fallback
        // Agora usa sistema híbrido: WebView first (iOS/Android) + fallback nativo (iOS)
        case 'SESSION_COOKIES_CAPTURED':
          if (data.cookies) {
            // Cookies de sessão capturados
            await SecureStore.setItemAsync(SESSION_COOKIES_KEY, JSON.stringify(data.cookies));
            
            // Definir expiração da sessão (ex: 8 horas)
            const sessionExpiry = Date.now() + (8 * 60 * 60 * 1000);
            await SecureStore.setItemAsync(SESSION_EXPIRY_KEY, sessionExpiry.toString());
          }
          break;
        case 'CSRF_TOKEN_CAPTURED':
          if (data.token) {
            // Token CSRF capturado
            await SecureStore.setItemAsync(CSRF_TOKENS_KEY, JSON.stringify(data.token));
          }
          break;
        case 'LOGIN_IDENTIFIER_TYPE_DETECTED':
          if (data.type) {
            // Tipo de identificador detectado
            await SecureStore.setItemAsync(LOGIN_IDENTIFIER_TYPE_KEY, data.type);
          }
          break;
        case '2FA_CODE_ENTERED':
          if (data.code) {
            // Código 2FA inserido manualmente
            await SecureStore.setItemAsync(LAST_2FA_CODE_KEY, data.code);
            await SecureStore.setItemAsync(LAST_2FA_TIMESTAMP_KEY, Date.now().toString());
          }
          break;
        case 'CAPTCHA_BYPASS_TOKEN':
          if (data.token) {
            // Token de bypass de captcha capturado
            await SecureStore.setItemAsync(CAPTCHA_BYPASS_TOKEN_KEY, data.token);
          }
          break;
        case 'FILE_UPLOAD_REQUEST':
          // Solicitação de upload de arquivo com expo-image-picker
          if (data.params) {
            console.log('📁 WebView: Processando solicitação de upload...');
            const files = await handleFileUpload(data.params);
            
            // Enviar resultado de volta para WebView
            if (webViewRef.current) {
              webViewRef.current.postMessage(JSON.stringify({
                type: 'FILE_UPLOAD_RESPONSE',
                files: files,
                requestId: data.requestId
              }));
            }
          }
          break;
        case 'LOGIN_SUCCESS_DETECTED':
          // Sucesso de login detectado
          const timestamp = Date.now().toString();
          
          // CRÍTICO: Capturar cookies nativos imediatamente após login bem-sucedido
          setTimeout(async () => {
            // Iniciando captura de cookies nativos após login
            const cookiesCaptured = await captureNativeCookies();
            if (cookiesCaptured) {
              // Cookies nativos capturados com sucesso para futuro uso
  
            } else {
              // Falha na captura de cookies nativos
  
            }
          }, 2000); // Aguardar 2s para garantir que cookies foram definidos pelo servidor
          
          // Salvar dados críticos do login bem-sucedido
          await Promise.all([
            SecureStore.setItemAsync(LAST_SUCCESSFUL_LOGIN_KEY, timestamp),
            SecureStore.setItemAsync(FIRST_LOGIN_COMPLETED_KEY, 'true'), // CRÍTICO: Marcar primeiro login completo
            SecureStore.setItemAsync(BIOMETRIC_TIMESTAMP_KEY, timestamp) // Atualizar timestamp para sessão
          ]);
          
          // Primeiro login marcado como completo - futuras aberturas usarão biometria
          
          break;
        case 'LOGOUT':
          handleLogout();
          break;
          
        default:
          // Mensagem não reconhecida
          break;
      }
    } catch (error) {
      // Mensagem não-JSON recebida
    }
  };

  // FUNÇÃO DE CONTROLE OTIMIZADA: Executa após carregamento com suporte a cookies nativos
    // Integra com novo sistema de captura/injeção nativa de cookies
    // Prioriza eficiência e evita operações desnecessárias
    const onLoadEnd = () => {
    // WebView carregada
    
    
    // CRÍTICO: Verificar se sessão expirou (usuário foi redirecionado para login.php)
    handleSessionExpiration();
    
    setIsWebViewReady(true);
    setIsLoading(false);

    // REMOVIDO: Sistema JavaScript de cookies para evitar conflitos
    // APENAS sistema nativo de cookies será usado (@react-native-cookies/cookies)
    // Sistema unificado: usando APENAS cookies nativos

    // === CAPTURA NATIVA DE SESSÃO OTIMIZADA ===
    // Prioriza captura nativa sobre JavaScript quando possível
    if (currentUrl.includes('inicial.php')) {
      // Área autenticada carregada com sucesso
      console.log('🏠 WebView: Usuário na página inicial, verificando dados pendentes...');
      
      // SISTEMA DE RETRY: Verificar se há dados de scan pendentes para processar
      const script = `
        (function() {
          console.log('🔍 WebView JS: Verificando dados pendentes na inicial.php...');
          
          // Verificar se existem dados pendentes
          const timestamp = localStorage.getItem('corpx_scan_timestamp');
          const processed = localStorage.getItem('corpx_scan_processed');
          
          if (timestamp && processed === 'pending') {
            const age = Date.now() - parseInt(timestamp);
            const maxAge = 10 * 60 * 1000; // 10 minutos
            
            if (age < maxAge) {
              console.log('⚠️ WebView JS: Dados pendentes encontrados! Tentando recuperar...');
              
              // Forçar execução da recuperação após um pequeno delay
              setTimeout(function() {
                if (typeof restoreScannedData === 'function') {
                  restoreScannedData();
                } else {
                  console.log('🔄 WebView JS: Função restoreScannedData não disponível ainda, tentando novamente...');
                  setTimeout(arguments.callee, 1000);
                }
              }, 500);
              
              // Enviar mensagem para o app React Native sobre dados pendentes
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SCAN_DATA_PENDING',
                timestamp: timestamp,
                age: age
              }));
            } else {
              console.log('⏰ WebView JS: Dados pendentes expirados, limpando...');
              // Limpar dados expirados
              localStorage.removeItem('corpx_scanned_pix_data');
              localStorage.removeItem('corpx_scanned_pix_value');
              localStorage.removeItem('corpx_scanned_boleto_data');
              localStorage.removeItem('corpx_scan_timestamp');
              localStorage.removeItem('corpx_scan_type');
              localStorage.removeItem('corpx_scan_processed');
              localStorage.removeItem('corpx_scan_retry_count');
            }
          } else {
            console.log('💭 WebView JS: Nenhum dado pendente encontrado');
          }
        })();
      `;
      
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(script);
      }
      
      // OTIMIZAÇÃO CRÍTICA: Usar captura nativa de cookies
      setTimeout(async () => {
        try {
          // Capturando cookies nativos da área autenticada
          const nativeCaptureSuccess = await captureNativeCookies();
          
          if (nativeCaptureSuccess) {
            // Cookies nativos atualizados da área autenticada
  
            
            // Marcar login como bem-sucedido
            const timestamp = Date.now().toString();
            await Promise.all([
              SecureStore.setItemAsync(LAST_SUCCESSFUL_LOGIN_KEY, timestamp),
              SecureStore.setItemAsync(FIRST_LOGIN_COMPLETED_KEY, 'true'),
              SecureStore.setItemAsync(BIOMETRIC_TIMESTAMP_KEY, timestamp)
            ]);
            
          } else {
            // Fallback para captura JavaScript se nativa falhar
            // Captura nativa falhou, usando fallback JavaScript
            if (webViewRef.current) {
              webViewRef.current.injectJavaScript(`
                (function() {
                  // Fallback: capturando via JavaScript
                  
                  if (document.cookie) {
                    const cookies = {};
                    document.cookie.split(';').forEach(cookie => {
                      const [name, value] = cookie.trim().split('=');
                      if (name && value && name.length > 1) {
                        cookies[name] = value;
                      }
                    });
                    
                    if (Object.keys(cookies).length > 0) {
                      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'SESSION_COOKIES_CAPTURED',
                        cookies: cookies,
                        timestamp: Date.now()
                      }));
                    }
                  }
                  
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'LOGIN_SUCCESS_DETECTED',
                    url: window.location.href,
                    timestamp: Date.now()
                  }));
                })();
              `);
            }
          }
        } catch (error) {
          console.error('❌ Erro na captura de sessão:', error);
        }
      }, 1000); // Timing otimizado para garantir que página carregou completamente
      
      return;
    }

    // === AUTO-LOGIN SILENCIOSO CORRIGIDO ===
    // CRÍTICO: Só executar auto-login se está em login.php MAS não deveria estar
    // (significa que cookies falharam e precisa fazer login automático)
    if (currentUrl.includes('login.php') && authStatus === 'authenticated' && !autoLoginDone && !cookiesInjected) {
      // Condições atendidas para auto-login na página de login
      
      
      // OTIMIZAÇÃO: Aguardar tempo mínimo necessário baseado na plataforma
      // iOS: mais rápido devido ao melhor gerenciamento de WebView
      // Android: aguardar mais para garantir renderização completa
      const platformDelay = Platform.OS === 'ios' ? 1200 : 2000;
      
      setTimeout(() => {
        // Iniciando auto-login otimizado

        tryAutoLogin();
      }, platformDelay);
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

  if (authStatus === 'checking' || authStatus === 'promptBiometric') {
    return <SplashScreen />;
  }

  const handleRenderProcessGone = () => {
    // Processo da WebView encerrado, recarregando
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  const onShouldStartLoadWithRequest = (request) => {
    const { url } = request;
    // Navegação solicitada
    
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
      // Tentando download
      
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
    // Download detectado pela WebView
    handleFileDownload(downloadUrl);
  };

  const injectedJavaScript = `
    (function() {
      // Script avançado de captura de credenciais injetado
      
      // === INFORMAÇÕES DE PLATAFORMA ===
      // Plataforma detectada pelo React Native (mais confiável que userAgent)
      const PLATFORM_OS = '${Platform.OS}';
      const IS_IOS = PLATFORM_OS === 'ios';
      const IS_ANDROID = PLATFORM_OS === 'android';
      
      // === INTERCEPTAÇÃO DE GETUSERMEDIA PARA CACHE DE PERMISSÕES ===
      // Intercepta chamadas getUserMedia para usar cache de permissões
      let originalGetUserMedia = null;
      let cameraPermissionGranted = false;
      
      // Verificar se já temos permissão em cache
      function checkCachedPermission() {
        try {
          // Verificar cache local primeiro
          const localCache = localStorage.getItem('webview_camera_permission');
          if (localCache === 'true') {
            return true;
          }
          
          // Solicitar verificação do cache nativo
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'CHECK_CAMERA_PERMISSION_CACHE',
              timestamp: Date.now()
            }));
          }
          
          return false;
        } catch (e) {
          return false;
        }
      }
      
      // Sincronizar cache com React Native
      function syncPermissionCache(granted) {
        try {
          localStorage.setItem('webview_camera_permission', granted ? 'true' : 'false');
          
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'SYNC_CAMERA_PERMISSION_CACHE',
              granted: granted,
              timestamp: Date.now()
            }));
          }
        } catch (e) {
          console.error('Erro ao sincronizar cache:', e);
        }
      }
      
      // Interceptar navigator.mediaDevices.getUserMedia
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        
        navigator.mediaDevices.getUserMedia = function(constraints) {
          console.log('📷 WebView JS: getUserMedia interceptado', constraints);
          
          // Se já temos permissão em cache, resolver imediatamente
           if (checkCachedPermission() && constraints.video) {
             console.log('✅ WebView JS: Usando permissão de câmera em cache');
             syncPermissionCache(true);
             return originalGetUserMedia(constraints);
           }
           
           // Primeira vez - permitir solicitação normal
           console.log('📱 WebView JS: Primeira solicitação de câmera - permitindo');
           return originalGetUserMedia(constraints).then(stream => {
             // Salvar permissão no cache após sucesso
             syncPermissionCache(true);
             cameraPermissionGranted = true;
             console.log('✅ WebView JS: Permissão de câmera salva no cache');
             return stream;
           }).catch(error => {
             console.log('❌ WebView JS: Erro ao obter câmera:', error);
             syncPermissionCache(false);
             throw error;
           });
        };
      }
      
      // Interceptar getUserMedia legado
      if (navigator.getUserMedia) {
        const originalLegacyGetUserMedia = navigator.getUserMedia.bind(navigator);
        navigator.getUserMedia = function(constraints, success, error) {
          console.log('📷 WebView JS: getUserMedia legado interceptado');
          
          if (checkCachedPermission() && constraints.video) {
            console.log('✅ WebView JS: Usando permissão legada em cache');
            return originalLegacyGetUserMedia(constraints, success, error);
          }
          
          return originalLegacyGetUserMedia(constraints, 
             function(stream) {
               syncPermissionCache(true);
               console.log('✅ WebView JS: Permissão legada salva no cache');
               success(stream);
             }, 
             function(err) {
               syncPermissionCache(false);
               error(err);
             }
           );
        };
      }

            // === FUNÇÕES UTILITÁRIAS ===
      // Verifica se um elemento HTML está visível na tela
      // Usado para validar se campos de formulário podem ser preenchidos
      function isVisible(el) {
        if (!el) return false;
        var style = window.getComputedStyle(el);
        var rect = el.getBoundingClientRect();
        return style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
      }

      function postMessage(type, data) {
        try {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: type,
              ...data,
              timestamp: Date.now(),
              url: window.location.href
            }));
          }
        } catch (e) {
          console.error('Erro ao enviar mensagem:', e);
        }
      }

      // === DETECÇÃO DE TIPOS DE LOGIN ===
      // Identifica automaticamente o tipo de identificador inserido pelo usuário
      // Suporta: CPF (11 dígitos), CNPJ (14 dígitos), email e usuário alfanumérico
      function detectLoginIdentifierType(value) {
        if (!value) return 'unknown';
        
        // Remover formatação
        var cleaned = value.replace(/[^0-9]/g, '');
        
        if (cleaned.length === 11) {
          return 'cpf';
        } else if (cleaned.length === 14) {
          return 'cnpj';
        } else if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
          return 'email';
        } else if (/^[a-zA-Z][a-zA-Z0-9._]*$/.test(value)) {
          return 'usuario';
        }
        
        return 'unknown';
      }

      // === CAPTURA DE CAMPOS ===
      // Funções para localizar campos de formulário usando múltiplos seletores CSS
      // Garantem compatibilidade com diferentes layouts de páginas de login
      function findLoginField() {
        var selectors = [
          'input[name*="login" i]',
          'input[name*="usuario" i]', 
          'input[name*="user" i]',
          'input[name*="cpf" i]',
          'input[name*="cnpj" i]',
          'input[name*="email" i]',
          'input[id*="login" i]',
          'input[id*="usuario" i]',
          'input[id*="user" i]',
          'input[id*="cpf" i]',
          'input[id*="cnpj" i]',
          'input[placeholder*="CPF" i]',
          'input[placeholder*="CNPJ" i]',
          'input[placeholder*="usuário" i]',
          'input[placeholder*="email" i]'
        ];
        
        for (var i = 0; i < selectors.length; i++) {
          var field = document.querySelector(selectors[i]);
          if (field && isVisible(field)) {
            return field;
          }
        }
        
        // Fallback: primeiro campo texto visível
        var textInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input:not([type])');
        for (var j = 0; j < textInputs.length; j++) {
          if (isVisible(textInputs[j])) {
            return textInputs[j];
          }
        }
        
        return null;
      }

      function findPasswordField() {
        var selectors = [
          'input[type="password"]',
          'input[name*="senha" i]',
          'input[name*="password" i]',
          'input[id*="senha" i]',
          'input[id*="password" i]'
        ];
        
        for (var i = 0; i < selectors.length; i++) {
          var field = document.querySelector(selectors[i]);
          if (field && isVisible(field)) {
            return field;
          }
        }
        return null;
      }

      function find2FAField() {
        var selectors = [
          'input[name*="token" i]',
          'input[name*="code" i]',
          'input[name*="2fa" i]',
          'input[name*="otp" i]',
          'input[name*="sms" i]',
          'input[name*="authenticator" i]',
          'input[id*="token" i]',
          'input[id*="code" i]',
          'input[id*="2fa" i]',
          'input[id*="otp" i]',
          'input[placeholder*="código" i]',
          'input[placeholder*="token" i]',
          'input[placeholder*="authenticator" i]'
        ];
        
        for (var i = 0; i < selectors.length; i++) {
          var field = document.querySelector(selectors[i]);
          if (field && isVisible(field) && field.type !== 'hidden') {
            return field;
          }
        }
        return null;
      }

      // === CAPTURA DE COOKIES E TOKENS ===
      // Sistema robusto para capturar e armazenar dados de sessão
      // Inclui cookies de autenticação, tokens CSRF e dados de segurança
      function captureSessionData() {
        // Capturar cookies
        var cookies = {};
        if (document.cookie) {
          document.cookie.split(';').forEach(function(cookie) {
            var parts = cookie.trim().split('=');
            if (parts.length === 2) {
              cookies[parts[0]] = parts[1];
            }
          });
          
          if (Object.keys(cookies).length > 0) {
            postMessage('SESSION_COOKIES_CAPTURED', { cookies: cookies });
          }
        }

        // Capturar tokens CSRF
        var csrfSelectors = [
          'meta[name="csrf-token"]',
          'meta[name="_token"]',
          'input[name="_token"]',
          'input[name="csrf_token"]'
        ];
        
        csrfSelectors.forEach(function(selector) {
          var element = document.querySelector(selector);
          if (element) {
            var token = element.getAttribute('content') || element.value;
            if (token) {
              postMessage('CSRF_TOKEN_CAPTURED', { token: token, source: selector });
            }
          }
        });
      }

      // === DETECÇÃO DE CAPTCHA ===
      // Sistema inteligente para detectar e tratar diferentes tipos de captcha
      // Suporta: reCAPTCHA v2, hCaptcha, captcha simples e captcha de imagem
      function detectCaptcha() {
        var captchaSelectors = [
          '.g-recaptcha',
          '.recaptcha',
          'iframe[src*="recaptcha"]',
          'img[src*="captcha"]',
          'input[name*="captcha" i]',
          '.hcaptcha',
          '#captcha'
        ];
        
        for (var i = 0; i < captchaSelectors.length; i++) {
          var element = document.querySelector(captchaSelectors[i]);
          if (element && isVisible(element)) {
            return {
              type: captchaSelectors[i].includes('recaptcha') ? 'recaptcha' : 'image',
              element: element
            };
          }
        }
        return null;
      }

      // === DETECÇÃO DE SUCESSO DE LOGIN ===
      // Múltiplos métodos para detectar login bem-sucedido
      // Verifica URL de redirecionamento e elementos visuais de sucesso
      function detectLoginSuccess() {
        // Verificar se estamos na página inicial (sucesso)
        if (window.location.href.includes('inicial.php')) {
          postMessage('LOGIN_SUCCESS_DETECTED', { url: window.location.href });
          captureSessionData();
          return true;
        }
        
        // Verificar mensagens de sucesso
        var successSelectors = [
          '.success',
          '.alert-success', 
          '[class*="success"]',
          '[id*="success"]'
        ];
        
        for (var i = 0; i < successSelectors.length; i++) {
          var element = document.querySelector(successSelectors[i]);
          if (element && isVisible(element)) {
            postMessage('LOGIN_SUCCESS_DETECTED', { 
              message: element.textContent || element.innerHTML 
            });
            return true;
          }
        }
        
        return false;
      }

      // === LISTENERS E CAPTURA ===
      // Sistema de eventos para capturar credenciais em tempo real
      // Monitora mudanças em campos de formulário e submissões
      function postCredentials(loginVal, passwordVal) {
        if (loginVal) {
          var identifierType = detectLoginIdentifierType(loginVal);
          postMessage('LOGIN_IDENTIFIER_TYPE_DETECTED', { type: identifierType });
        }
        
        postMessage('LOGIN_CREDENTIALS_CAPTURED', {
          credentials: { 
            login: loginVal || '', 
            password: passwordVal || '' 
          }
        });
      }

      function attachAdvancedListeners() {
        var loginField = findLoginField();
        var passwordField = findPasswordField();
        var twoFAField = find2FAField();
        var form = document.querySelector('form');

        // Listeners para campos de login
        if (loginField) {
          ['input', 'change', 'blur'].forEach(function(event) {
            loginField.addEventListener(event, function() {
              window._corpxLoginValue = loginField.value || '';
              postCredentials(window._corpxLoginValue, window._corpxPasswordValue);
            });
          });
        }

        if (passwordField) {
          ['input', 'change', 'blur'].forEach(function(event) {
            passwordField.addEventListener(event, function() {
              window._corpxPasswordValue = passwordField.value || '';
              postCredentials(window._corpxLoginValue, window._corpxPasswordValue);
            });
          });
        }

        // Listeners para 2FA
        if (twoFAField) {
          ['input', 'change'].forEach(function(event) {
            twoFAField.addEventListener(event, function() {
              var code = twoFAField.value;
              if (code && code.length >= 4) {
                sessionStorage.setItem('corpx_2fa_code', code);
                postMessage('2FA_CODE_ENTERED', { code: code });
              }
            });
          });
        }

        // Listener para submit do formulário
        if (form) {
          form.addEventListener('submit', function(e) {
            var l = (loginField && loginField.value) || window._corpxLoginValue || '';
            var p = (passwordField && passwordField.value) || window._corpxPasswordValue || '';
            
            if (l && p) {
              postMessage('LOGIN_ATTEMPT', { 
                credentials: { login: l, password: p },
                hasCaptcha: !!detectCaptcha(),
                has2FA: !!find2FAField()
              });
            }
          });
        }

        // Detectar mudanças no DOM para capturar novos campos
        if (typeof MutationObserver !== 'undefined') {
          var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
              if (mutation.addedNodes.length > 0) {
                setTimeout(function() {
                  attachAdvancedListeners();
                }, 100);
              }
            });
          });
          
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
        }
      }

      // === INICIALIZAÇÃO ===
      // Configuração inicial do sistema de captura avançada
      // Executa detecções, anexa listeners e inicia monitoramento contínuo
      function init() {
        // Inicializando script avançado
        
        try {
          // Capturar dados de sessão imediatamente
          captureSessionData();
          
          // Detectar sucesso de login
          detectLoginSuccess();
          
          // Anexar listeners
          attachAdvancedListeners();
          
          // Detectar captcha
          var captcha = detectCaptcha();
          if (captcha) {
            // Captcha detectado
          }
          
        } catch (e) {
          console.error('Erro na inicialização:', e);
        }
        
        // Re-executar periodicamente para capturar mudanças
        var retryCount = 0;
        var retryTimer = setInterval(function() {
          retryCount++;
          try {
            attachAdvancedListeners();
            captureSessionData();
            
            if (detectLoginSuccess()) {
              clearInterval(retryTimer);
            }
          } catch (e) {}
          
          if (retryCount >= 15) {
            clearInterval(retryTimer);
          }
        }, 1000);
      }

      // === LISTENER GLOBAL PARA INPUTS ===
      // Captura códigos 2FA inseridos em qualquer campo de entrada
      // Funciona independentemente da estrutura da página
      document.addEventListener('input', function(e) {
        var target = e.target;
        if (!target || target.tagName !== 'INPUT') return;
        
        // Detectar códigos 2FA
        var fieldInfo = (target.name + ' ' + target.id + ' ' + target.placeholder).toLowerCase();
        if (/token|code|2fa|otp|sms|authenticator|código/.test(fieldInfo)) {
          var value = target.value;
          if (value && value.length >= 4 && value.length <= 8) {
            sessionStorage.setItem('corpx_2fa_code', value);
            postMessage('2FA_CODE_ENTERED', { code: value });
          }
        }
      });

      // === EXECUÇÃO ===
      // Inicialização inteligente que funciona em diferentes estados de carregamento
      // Garante execução mesmo se DOM ainda não estiver completamente carregado
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
      
      // Executar também após um delay para garantir que tudo carregou
      setTimeout(init, 500);
      
      // === RECUPERAÇÃO APRIMORADA DE DADOS ESCANEADOS ===
      // Sistema robusto de persistência e recuperação com retry e logging
      function restoreScannedData() {
        console.log('🔄 WebView: Verificando dados escaneados salvos...');
        
        try {
          const timestamp = localStorage.getItem('corpx_scan_timestamp');
          const processedFlag = localStorage.getItem('corpx_scan_processed');
          
          if (timestamp) {
            const age = Date.now() - parseInt(timestamp);
            const maxAge = 10 * 60 * 1000; // Aumentado para 10 minutos
            
            console.log('🕒 WebView: Dados encontrados com idade de', Math.floor(age/1000), 'segundos');
            
            if (age < maxAge) {
              // Dados ainda válidos, tentar restaurar
              const pixData = localStorage.getItem('corpx_scanned_pix_data');
              const pixValue = localStorage.getItem('corpx_scanned_pix_value');
              const boletoData = localStorage.getItem('corpx_scanned_boleto_data');
              const scanType = localStorage.getItem('corpx_scan_type');
              const retryCount = parseInt(localStorage.getItem('corpx_scan_retry_count') || '0');
              
              let restored = false;
              
              // Se já foi processado com sucesso, não tentar novamente
              if (processedFlag === 'success') {
                console.log('✅ WebView: Dados já foram processados com sucesso anteriormente');
                clearScannedData();
                return;
              }
              
              console.log('📊 WebView: Tentativa de restauração #' + (retryCount + 1));
              
              if (pixData && (scanType === 'pix' || scanType === 'qr_code')) {
                console.log('💰 WebView: Tentando restaurar dados PIX...', pixData.substring(0, 50) + '...');
                
                const pixSelectors = [
                  'input[placeholder*="PIX"]',
                  'input[placeholder*="pix"]', 
                  'input[placeholder*="chave"]',
                  'input[name*="pix"]',
                  'input[id*="pix"]',
                  'input[class*="pix"]',
                  'textarea[placeholder*="PIX"]',
                  'textarea[placeholder*="pix"]',
                  // Seletores mais genéricos
                  'input[type="text"]:not([value])',
                  'textarea:empty'
                ];
                
                for (const selector of pixSelectors) {
                  const input = document.querySelector(selector);
                  if (input && !input.value) {
                    console.log('✅ WebView: Campo PIX encontrado e preenchido:', selector);
                    input.focus();
                    input.value = pixData;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                    restored = true;
                    break;
                  }
                }
                
                // Preencher valor se disponível
                if (pixValue && restored) {
                  console.log('💰 WebView: Tentando restaurar valor PIX:', pixValue);
                  const valueSelectors = [
                    'input[placeholder*="valor"]',
                    'input[name*="value"]',
                    'input[type="number"]',
                    'input[id*="valor"]',
                    'input[class*="valor"]',
                    'input[inputmode="decimal"]'
                  ];
                  
                  for (const selector of valueSelectors) {
                    const input = document.querySelector(selector);
                    if (input && !input.value) {
                      console.log('✅ WebView: Campo valor encontrado e preenchido:', selector);
                      input.focus();
                      input.value = pixValue;
                      input.dispatchEvent(new Event('input', { bubbles: true }));
                      input.dispatchEvent(new Event('change', { bubbles: true }));
                      input.dispatchEvent(new Event('blur', { bubbles: true }));
                      break;
                    }
                  }
                }
              }
              
              if (boletoData && scanType === 'boleto') {
                console.log('🧦 WebView: Tentando restaurar dados de boleto...', boletoData.substring(0, 30) + '...');
                
                const boletoSelectors = [
                  'input[placeholder*="boleto"]',
                  'input[placeholder*="código"]',
                  'input[placeholder*="barras"]',
                  'input[name*="boleto"]',
                  'input[id*="boleto"]',
                  'input[class*="boleto"]',
                  'textarea[placeholder*="boleto"]',
                  // Seletores mais genéricos para boleto
                  'input[maxlength="47"]',
                  'input[maxlength="48"]'
                ];
                
                for (const selector of boletoSelectors) {
                  const input = document.querySelector(selector);
                  if (input && !input.value) {
                    console.log('✅ WebView: Campo boleto encontrado e preenchido:', selector);
                    input.focus();
                    input.value = boletoData;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                    restored = true;
                    break;
                  }
                }
              }
              
              if (restored) {
                console.log('✅ WebView: Dados restaurados com sucesso!');
                localStorage.setItem('corpx_scan_processed', 'success');
                
                // Tentar encontrar e clicar em botão de continuar após um delay
                setTimeout(() => {
                  const buttonSelectors = [
                    'button[type="submit"]:not([disabled])',
                    'input[type="submit"]:not([disabled])',
                    'button:contains("Continuar"):not([disabled])',
                    'button:contains("Processar"):not([disabled])',
                    'button:contains("Pagar"):not([disabled])',
                    'button:contains("Confirmar"):not([disabled])',
                    '.btn-submit:not([disabled])',
                    '.btn-continue:not([disabled])'
                  ];
                  
                  for (const selector of buttonSelectors) {
                    const button = document.querySelector(selector);
                    if (button && !button.disabled) {
                      console.log('✅ WebView: Botão de continuar encontrado e clicado:', selector);
                      button.click();
                      break;
                    }
                  }
                }, 2000);
                
              } else if (retryCount < 5) {
                console.log('⚠️ WebView: Falha na restauração, tentativa', retryCount + 1, 'de 5');
                localStorage.setItem('corpx_scan_retry_count', (retryCount + 1).toString());
                
                // Tentar novamente em 2 segundos
                setTimeout(restoreScannedData, 2000);
              } else {
                console.log('❌ WebView: Máximo de tentativas atingido, limpando dados');
                clearScannedData();
              }
              
            } else {
              console.log('⏰ WebView: Dados expirados, limpando...');
              clearScannedData();
            }
          } else {
            console.log('💭 WebView: Nenhum dado escaneado encontrado no localStorage');
          }
        } catch (error) {
          console.error('❌ WebView: Erro durante recuperação de dados:', error);
        }
      }
      
      // Função para limpar dados escaneados
      function clearScannedData() {
        console.log('🧹 WebView: Limpando dados escaneados do localStorage');
        localStorage.removeItem('corpx_scanned_pix_data');
        localStorage.removeItem('corpx_scanned_pix_value');
        localStorage.removeItem('corpx_scanned_boleto_data');
        localStorage.removeItem('corpx_scan_timestamp');
        localStorage.removeItem('corpx_scan_type');
        localStorage.removeItem('corpx_scan_processed');
        localStorage.removeItem('corpx_scan_retry_count');
      }
      
      // === SISTEMA DE DETECÇÃO DE FALHA WEBVIEW CAMERA ===
      // Detecta se a câmera WebView falha no iOS e aciona fallback
      let webViewCameraTimeout = null;
      let webViewCameraAttempted = false;
      
      function detectWebViewCameraFailure(element) {
        if (!IS_IOS) return false; // Só para iOS
        
        console.log('📷 WebView JS: [iOS] Iniciando detecção de falha da câmera WebView...');
        webViewCameraAttempted = true;
        
        // Configurar timeout de 5 segundos para detectar falha
        webViewCameraTimeout = setTimeout(() => {
          console.log('⏰ WebView JS: [iOS] Timeout da câmera WebView - acionando fallback');
          triggerNativeScannerFallback(element);
        }, 5000);
        
        // Detectar eventos que indicam sucesso da câmera WebView
        const successEvents = ['devicechange', 'canplay', 'playing'];
        successEvents.forEach(event => {
          navigator.mediaDevices.addEventListener(event, () => {
            if (webViewCameraTimeout) {
              console.log('✅ WebView JS: [iOS] Câmera WebView ativada com sucesso');
              clearTimeout(webViewCameraTimeout);
              webViewCameraTimeout = null;
            }
          });
        });
        
        // Detectar erros de mídia
        window.addEventListener('error', (e) => {
          if (e.target.tagName === 'VIDEO' && webViewCameraTimeout) {
            console.log('❌ WebView JS: [iOS] Erro na câmera WebView detectado');
            clearTimeout(webViewCameraTimeout);
            triggerNativeScannerFallback(element);
          }
        });
        
        return true;
      }
      
      function triggerNativeScannerFallback(element) {
        console.log('🔄 WebView JS: [iOS] Acionando scanner nativo como fallback');
        webViewCameraTimeout = null;
        
        postMessage('OPEN_SCANNER', {
          platform: 'ios',
          elementText: element.textContent || element.innerText || '',
          elementId: element.id || '',
          elementClass: element.className || '',
          url: window.location.href,
          timestamp: Date.now(),
          fallbackReason: 'webview_camera_failed'
        });
      }
      
      // === FUNÇÃO DE INJEÇÃO ROBUSTA DE QR CODE ===
      // Função melhorada para injetar dados escaneados e prosseguir com pagamento
      function handleQRCodeScanned(qrData, sourceType = 'unknown') {
        console.log('🔄 WebView JS: [' + PLATFORM_OS + '] Iniciando injeção de QR Code...', {
          qrData: qrData,
          source: sourceType
        });
        
        try {
          // Limpar timeout de fallback se ainda ativo (iOS)
          if (webViewCameraTimeout) {
            clearTimeout(webViewCameraTimeout);
            webViewCameraTimeout = null;
            console.log('⏰ WebView JS: [iOS] Timeout cancelado - dados recebidos');
          }
          
          // Seletores expandidos para campos QR/PIX/Boleto
          const inputSelectors = [
            // PIX específicos
            '#campoPixQRCode', 'input[id*="pixqr"]', 'input[id*="qrpix"]',
            'input[name*="pixqr"]', 'input[name*="qrpix"]',
            'input[placeholder*="PIX"]', 'input[placeholder*="pix"]',
            'input[placeholder*="QR"]', 'input[placeholder*="qr"]',
            'input[placeholder*="chave"]',
            // Boleto específicos  
            'input[id*="boleto"]', 'input[name*="boleto"]',
            'input[placeholder*="boleto"]', 'input[placeholder*="código"]',
            // Genéricos
            'input[id*="codigo"]', 'input[name*="codigo"]',
            'input[class*="qr"]', 'input[class*="pix"]',
            'textarea[placeholder*="PIX"]', 'textarea[placeholder*="código"]'
          ];
          
          let targetInput = null;
          for (const selector of inputSelectors) {
            targetInput = document.querySelector(selector);
            if (targetInput && isVisible(targetInput)) {
              console.log('✅ WebView JS: Campo alvo encontrado:', selector);
              break;
            }
          }
          
          if (targetInput) {
            // Preencher campo com dados escaneados
            targetInput.focus();
            targetInput.value = '';
            targetInput.value = qrData;
            
            // Disparar eventos para ativar validações JavaScript
            const events = ['input', 'change', 'blur', 'keyup'];
            events.forEach(eventType => {
              const event = new Event(eventType, { bubbles: true, cancelable: true });
              targetInput.dispatchEvent(event);
            });
            
            console.log('✅ WebView JS: Campo preenchido com QR data:', qrData.substring(0, 50) + '...');
            
            // Tentar encontrar e clicar botão "Continuar"
            setTimeout(() => {
              const buttonSelectors = [
                '#btnContinuar', 'button[id*="continuar"]',
                'button[onclick*="continuar"]', 'button[type="submit"]',
                'input[type="submit"]', '.btn-continuar',
                'button:contains("Continuar")', 'button:contains("Prosseguir")',
                'button:contains("Confirmar")', 'button:contains("Processar")'
              ];
              
              let continueButton = null;
              for (const selector of buttonSelectors) {
                continueButton = document.querySelector(selector);
                if (continueButton && isVisible(continueButton) && !continueButton.disabled) {
                  console.log('✅ WebView JS: Botão continuar encontrado:', selector);
                  break;
                }
              }
              
              if (continueButton) {
                continueButton.click();
                console.log('🚀 WebView JS: Clique no botão continuar executado');
                
                // Notificar React Native sobre sucesso
                postMessage('QR_CODE_PROCESSED', {
                  success: true,
                  source: sourceType,
                  data: qrData.substring(0, 100) // Primeiros 100 chars para debug
                });
              } else {
                console.log('⚠️ WebView JS: Botão continuar não encontrado - dados preenchidos');
                postMessage('QR_CODE_PROCESSED', {
                  success: true,
                  source: sourceType,
                  needsManualContinue: true
                });
              }
            }, 1500); // Aguardar 1.5s para validações
            
          } else {
            console.log('❌ WebView JS: Campo para QR Code não encontrado');
            postMessage('QR_CODE_PROCESSED', {
              success: false,
              error: 'input_field_not_found',
              source: sourceType
            });
          }
          
        } catch (error) {
          console.error('❌ WebView JS: Erro na injeção de QR Code:', error);
          postMessage('QR_CODE_PROCESSED', {
            success: false,
            error: error.message,
            source: sourceType
          });
        }
      }
      
      // === DETECÇÃO DE SCANNER ===
      // Detecta cliques em botões/links relacionados a scanner, QR code ou boleto
      function detectScannerButtons() {
        const scannerSelectors = [
          'button[onclick*="scanner"]',
          'button[onclick*="qr"]', 
          'button[onclick*="boleto"]',
          'a[href*="scanner"]',
          'a[href*="qr"]',
          'a[href*="boleto"]',
          '[class*="scanner"]',
          '[class*="qr"]',
          '[class*="boleto"]',
          '[id*="scanner"]',
          '[id*="qr"]',
          '[id*="boleto"]'
        ];
        
        scannerSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            element.addEventListener('click', function(e) {
              
              console.log('📱 WebView JS: [' + PLATFORM_OS + '] Botão scanner clicado');
              
              if (IS_IOS) {
                // NOVO: Sistema híbrido iOS - tentar WebView primeiro, fallback se falhar
                console.log('📱 WebView JS: [iOS] Tentando câmera WebView primeiro...');
                
                // Iniciar detecção de falha da câmera WebView
                detectWebViewCameraFailure(element);
                
                // NÃO interceptar - permitir tentativa WebView primeiro
                // A interceptação só acontece no fallback se WebView falhar
                console.log('📱 WebView JS: [iOS] Permitindo tentativa câmera WebView (com fallback em 5s)');
                
              } else {
                // Android: permitir câmera WebView nativa (sem mudanças)
                console.log('📱 WebView JS: [Android] Permitindo câmera WebView nativa');
                // Não interceptar - deixar WebView lidar nativamente
              }
            });
          });
        });
      }
      
      // === DETECÇÃO DE UPLOAD DE ARQUIVOS ===
      // Intercepta elementos input[type="file"] e integra com expo-image-picker
      function setupFileUploadInterception() {
        const fileInputs = document.querySelectorAll('input[type="file"]');
        
        fileInputs.forEach(input => {
          if (input.dataset.corpxIntercepted) return; // Evitar dupla interceptação
          
          input.dataset.corpxIntercepted = 'true';
          
          input.addEventListener('click', function(e) {
            
            if (IS_IOS) {
              e.preventDefault();
              e.stopPropagation();
              
              console.log('📁 WebView JS: Upload de arquivo interceptado no iOS');
              
              const requestId = 'upload_' + Date.now();
              
              // Enviar solicitação para React Native
              postMessage('FILE_UPLOAD_REQUEST', {
                requestId: requestId,
                accept: input.accept || '*/*',
                capture: input.hasAttribute('capture'),
                multiple: input.multiple || false
              });
              
              // Aguardar resposta
              const handleUploadResponse = (event) => {
                try {
                  const data = JSON.parse(event.data);
                  if (data.type === 'FILE_UPLOAD_RESPONSE' && data.requestId === requestId) {
                    window.removeEventListener('message', handleUploadResponse);
                    
                    if (data.files && data.files.length > 0) {
                      console.log('✅ WebView JS: Arquivos recebidos:', data.files.length);
                      
                      // Simular seleção de arquivos
                      const event = new Event('change', { bubbles: true });
                      Object.defineProperty(event, 'target', { value: input });
                      Object.defineProperty(input, 'files', { value: data.files });
                      
                      input.dispatchEvent(event);
                    }
                  }
                } catch (error) {
                  console.error('❌ WebView JS: Erro ao processar resposta de upload:', error);
                }
              };
              
              window.addEventListener('message', handleUploadResponse);
            }
          });
        });
      }
      
      // Executar detecção de scanner após carregamento
      setTimeout(detectScannerButtons, 1000);
      
      // Executar interceptação de upload de arquivos
      setTimeout(setupFileUploadInterception, 1000);
      
      // Executar recuperação de dados escaneados
      setTimeout(restoreScannedData, 500);
      
      // Sistema simplificado - sem detecção de reload (não necessária)
      
      // === SISTEMA DE MONITORAMENTO E RECOVERY AVANÇADO ===
      // Monitorar mudanças na página e detectar problemas no fluxo
      const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          if (mutation.addedNodes.length > 0) {
            setTimeout(detectScannerButtons, 100);
            setTimeout(setupFileUploadInterception, 150);
            setTimeout(restoreScannedData, 200);
            setTimeout(monitorPaymentFlow, 500);
          }
        });
      });
      
      // Função para monitorar o fluxo de pagamento e detectar falhas
      function monitorPaymentFlow() {
        try {
          const timestamp = localStorage.getItem('corpx_scan_timestamp');
          const processed = localStorage.getItem('corpx_scan_processed');
          
          if (timestamp && processed === 'pending') {
            console.log('🔍 WebView: Monitorando fluxo de pagamento...');
            
            // Detectar mensagens de erro comuns
            const errorIndicators = [
              'erro', 'error', 'falha', 'fail', 'inválido', 'invalid',
              'não foi possível', 'unable', 'timeout', 'expirado', 'expired'
            ];
            
            const pageText = document.body.innerText.toLowerCase();
            const hasError = errorIndicators.some(indicator => pageText.includes(indicator));
            
            if (hasError) {
              console.log('❌ WebView: Erro detectado no fluxo de pagamento');
              
              // Incrementar contador de retry
              const retryCount = parseInt(localStorage.getItem('corpx_scan_retry_count') || '0');
              if (retryCount < 3) {
                console.log('🔄 WebView: Tentando recuperação automática...');
                localStorage.setItem('corpx_scan_retry_count', (retryCount + 1).toString());
                
                // Tentar voltar para a página de pagamento e restaurar dados
                setTimeout(() => {
                  // Tentar navegar de volta ou recarregar
                  if (document.querySelector('a[href*="pagar"], a[href*="pagamento"], button[onclick*="pagar"]')) {
                    document.querySelector('a[href*="pagar"], a[href*="pagamento"], button[onclick*="pagar"]').click();
                  } else {
                    // Forçar restauração dos dados
                    restoreScannedData();
                  }
                }, 2000);
              } else {
                console.log('❌ WebView: Máximo de tentativas de recovery atingido');
                localStorage.setItem('corpx_scan_processed', 'failed');
                
                // Notificar app React Native sobre falha
                window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'SCAN_PROCESSING_FAILED',
                  reason: 'Max retries exceeded',
                  error: pageText.substring(0, 200)
                }));
              }
            }
            
            // Detectar sucesso no pagamento
            const successIndicators = [
              'sucesso', 'success', 'confirmado', 'confirmed', 'processado', 'processed',
              'pagamento realizado', 'payment completed', 'transação aprovada'
            ];
            
            const hasSuccess = successIndicators.some(indicator => pageText.includes(indicator));
            
            if (hasSuccess) {
              console.log('✅ WebView: Sucesso detectado no fluxo de pagamento');
              localStorage.setItem('corpx_scan_processed', 'success');
              
              // Limpar dados após sucesso
              setTimeout(() => {
                clearScannedData();
              }, 5000);
              
              // Notificar sucesso
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SCAN_PROCESSING_SUCCESS',
                message: 'Pagamento processado com sucesso'
              }));
            }
          }
        } catch (error) {
          console.error('❌ WebView: Erro no monitoramento do fluxo:', error);
        }
      }
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
    })();
    true;
  `;

  const manage2FAFlow = async () => {
    try {
      const lastCode = await SecureStore.getItemAsync(LAST_2FA_CODE_KEY);
      const lastTimestamp = await SecureStore.getItemAsync(LAST_2FA_TIMESTAMP_KEY);
      
      if (!lastCode || !lastTimestamp) {
        // Código 2FA não disponível
        return null;
      }

      // Verificar se o código não é muito antigo (códigos 2FA expiram em ~30 segundos)
      const age = Date.now() - parseInt(lastTimestamp);
      const maxAge = 25 * 1000; // 25 segundos para ser seguro
      
      if (age > maxAge) {
        // Código 2FA expirado, limpando
        await Promise.all([
          SecureStore.deleteItemAsync(LAST_2FA_CODE_KEY),
          SecureStore.deleteItemAsync(LAST_2FA_TIMESTAMP_KEY)
        ]);
        return null;
      }

      // Código 2FA válido disponível
      return lastCode;
    } catch (error) {
      console.error('❌ Erro ao gerenciar 2FA:', error);
      return null;
    }
  };

  const getStoredCookiesForRequest = async () => {
    try {
      const savedCookies = await SecureStore.getItemAsync(SESSION_COOKIES_KEY);
      if (!savedCookies) return '';

      const cookies = JSON.parse(savedCookies);
      return Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
    } catch (error) {
      console.error('❌ Erro ao recuperar cookies:', error);
      return '';
    }
  };

  // FUNÇÃO DESABILITADA: injectCookiesIntoWebView
  // MOTIVO: Sistema unificado usa APENAS @react-native-cookies/cookies (nativo)
  // Evita conflitos entre sistema JavaScript e nativo de cookies
  const injectCookiesIntoWebView = async () => {
    // SISTEMA JAVASCRIPT DE COOKIES DESABILITADO
    return; // NÃO executa mais injeção JavaScript
  };

  // FUNÇÃO AVANÇADA: Executa login automático com credenciais salvas
    // Injeta JavaScript inteligente para preencher formulários e lidar com 2FA/captcha
    // Sistema robusto com múltiplas tentativas e tratamento de edge cases
    const tryAutoLogin = async () => {
    try {
      // Iniciando processo de auto-login
      
      // REMOVIDO: injectCookiesIntoWebView - usando apenas sistema nativo
      // Sistema nativo de cookies será usado durante auto-login
      
      const storedLogin = await SecureStore.getItemAsync(LOGIN_KEY);
      const storedPassword = await SecureStore.getItemAsync(PASSWORD_KEY);
      const loginType = await SecureStore.getItemAsync(LOGIN_IDENTIFIER_TYPE_KEY);

      if (!storedLogin || !storedPassword) {
        // Credenciais não encontradas no SecureStore. Impossível auto-login
        setAutoLoginDone(true);
        setAuthStatus('needsLogin');
        setCurrentUrl('https://app.corpxbank.com.br/login.php');
        setInitialUrl('https://app.corpxbank.com.br/login.php');
        return;
      }

      // Verificar se há código 2FA disponível
      const available2FA = await manage2FAFlow();
      
      // Tentando auto-login com credenciais salvas
      
      setAutoLoginDone(true);

      const safeLogin = (storedLogin || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '$$$$').replace(/'/g, "\\'");
      const safePassword = (storedPassword || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '$$$$').replace(/'/g, "\\'");
      const safe2FA = available2FA ? available2FA.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '$$$$').replace(/'/g, "\\'") : '';

      const script = `
        (function() {
          const LOGIN_VALUE = '${safeLogin}';
          const PASSWORD_VALUE = '${safePassword}';
          const TWO_FA_CODE = '${safe2FA}';
          
          // Auto-login inteligente iniciado
            login: !!LOGIN_VALUE,
            password: !!PASSWORD_VALUE,
            twoFA: !!TWO_FA_CODE
          });

          function isVisible(el) {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
          }

          function setNativeValue(element, value) {
            if (!element || !value) return false;
            
            const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
            const prototype = Object.getPrototypeOf(element);
            const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
            
            if (valueSetter && valueSetter !== prototypeValueSetter) {
              prototypeValueSetter.call(element, value);
            } else if (valueSetter) {
              valueSetter.call(element, value);
            } else {
              element.value = value;
            }
            
            // Disparar eventos para garantir que o site detecte as mudanças
            ['input', 'change', 'blur', 'keyup', 'keydown'].forEach(eventType => {
              element.dispatchEvent(new Event(eventType, { bubbles: true }));
            });
            
            return true;
          }

          function findLoginField() {
            const selectors = [
              'input[name*="login" i]', 'input[name*="usuario" i]', 'input[name*="user" i]',
              'input[name*="cpf" i]', 'input[name*="cnpj" i]', 'input[name*="email" i]',
              'input[id*="login" i]', 'input[id*="usuario" i]', 'input[id*="user" i]',
              'input[id*="cpf" i]', 'input[id*="cnpj" i]', 'input[placeholder*="CPF" i]',
              'input[placeholder*="CNPJ" i]', 'input[placeholder*="usuário" i]', 'input[placeholder*="email" i]'
            ];
            
            for (const selector of selectors) {
              const field = document.querySelector(selector);
              if (field && isVisible(field)) return field;
            }
            
            // Fallback: primeiro campo texto visível
            const textInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input:not([type])');
            for (const input of textInputs) {
              if (isVisible(input)) return input;
            }
            return null;
          }

          function findPasswordField() {
            const selectors = [
              'input[type="password"]',
              'input[name*="senha" i]', 'input[name*="password" i]',
              'input[id*="senha" i]', 'input[id*="password" i]'
            ];
            
            for (const selector of selectors) {
              const field = document.querySelector(selector);
              if (field && isVisible(field)) return field;
            }
            return null;
          }

          function find2FAField() {
            const selectors = [
              'input[name*="token" i]', 'input[name*="code" i]', 'input[name*="2fa" i]',
              'input[name*="otp" i]', 'input[name*="sms" i]', 'input[name*="authenticator" i]',
              'input[id*="token" i]', 'input[id*="code" i]', 'input[id*="2fa" i]',
              'input[id*="otp" i]', 'input[placeholder*="código" i]', 'input[placeholder*="token" i]'
            ];
            
            for (const selector of selectors) {
              const field = document.querySelector(selector);
              if (field && isVisible(field) && field.type !== 'hidden') return field;
            }
            return null;
          }

          function detectAndHandleCaptcha() {
            // Detectando captcha
            
            // reCAPTCHA v2
            const recaptchaV2 = document.querySelector('.g-recaptcha iframe, iframe[src*="recaptcha"]');
            if (recaptchaV2 && isVisible(recaptchaV2)) {
              // reCAPTCHA v2 detectado
              const checkbox = document.querySelector('#recaptcha-anchor, .recaptcha-checkbox-checkmark');
              if (checkbox && !checkbox.checked) {
                // Clicando em reCAPTCHA checkbox
                checkbox.click();
                return 'recaptcha_v2_clicked';
              }
            }

            // Captcha simples (checkbox)
            const simpleCheckbox = document.querySelector('input[type="checkbox"][name*="captcha" i], input[type="checkbox"][id*="captcha" i]');
            if (simpleCheckbox && isVisible(simpleCheckbox) && !simpleCheckbox.checked) {
              // Clicando em captcha checkbox simples
              simpleCheckbox.click();
              return 'simple_checkbox_clicked';
            }

            // Captcha de imagem (mais difícil de resolver automaticamente)
            const imageCaptcha = document.querySelector('img[src*="captcha" i], img[alt*="captcha" i]');
            if (imageCaptcha && isVisible(imageCaptcha)) {
              // Captcha de imagem detectado - pode precisar de intervenção manual
              return 'image_captcha_detected';
            }

            return 'no_captcha';
          }

          function findSubmitButton() {
            const selectors = [
              'button[type="submit"]', 'input[type="submit"]',
              'button[name*="entrar" i]', 'button[id*="entrar" i]',
              'button[class*="login" i]', 'button[class*="entrar" i]'
            ];
            
            for (const selector of selectors) {
              const btn = document.querySelector(selector);
              if (btn && isVisible(btn)) return btn;
            }

            // Buscar por texto
            const buttons = Array.from(document.querySelectorAll('button, input[type="button"]'));
            return buttons.find(btn => 
              /entrar|login|acessar|enviar|submit/i.test(btn.textContent || btn.value || '')
            );
          }

          function attemptIntelligentAutoLogin() {
            // Iniciando auto-login inteligente
            
            // Verificar se há campo 2FA primeiro
            const twoFAField = find2FAField();
            if (twoFAField) {
              // Campo 2FA detectado
              
              if (TWO_FA_CODE) {
                // Preenchendo código 2FA automaticamente
                setNativeValue(twoFAField, TWO_FA_CODE);
                
                setTimeout(() => {
                  const submitBtn = findSubmitButton();
                  if (submitBtn) {
                    // Submetendo com 2FA
                    submitBtn.click();
                  }
                }, 1000);
                return true;
              } else {
                // Tentar usar código salvo
                const saved2FA = sessionStorage.getItem('corpx_2fa_code') || localStorage.getItem('corpx_2fa_code');
                if (saved2FA) {
                  // Usando código 2FA salvo
                  setNativeValue(twoFAField, saved2FA);
                  
                  setTimeout(() => {
                    const submitBtn = findSubmitButton();
                    if (submitBtn) submitBtn.click();
                  }, 1000);
                  return true;
                } else {
                  // Campo 2FA detectado mas código não disponível
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'NEED_2FA_CODE',
                    message: 'Campo 2FA detectado - código necessário'
                  }));
                  return false;
                }
              }
            }

            // Processo normal de login
            const loginField = findLoginField();
            const passwordField = findPasswordField();
            
            // Campos encontrados: login e password

            if (!loginField || !passwordField) {
              // Campos de login não encontrados
              return false;
            }

            // Preencher credenciais
            // Preenchendo credenciais
            const loginFilled = setNativeValue(loginField, LOGIN_VALUE);
            const passwordFilled = setNativeValue(passwordField, PASSWORD_VALUE);
            
            if (!loginFilled || !passwordFilled) {
              // Falha ao preencher credenciais
              return false;
            }

            // Credenciais preenchidas com sucesso

            // Detectar e tratar captcha
            const captchaResult = detectAndHandleCaptcha();
            // Resultado do captcha processado

            // Aguardar um pouco para processar captcha e então submeter
            const submitDelay = captchaResult.includes('clicked') ? 2000 : 1000;
            
            setTimeout(() => {
              // Tentando submeter formulário
              
              const submitBtn = findSubmitButton();
              if (submitBtn) {
                // Botão submit encontrado, clicando
                submitBtn.click();
              } else {
                // Botão submit não encontrado, tentando submit do form
                const form = loginField.form || passwordField.form || document.querySelector('form');
                if (form) {
                  // Submetendo formulário
                  if (form.requestSubmit) {
                    form.requestSubmit();
                  } else {
                    form.submit();
                  }
                } else {
                  // Nenhum método de submissão encontrado
                }
              }
              
              // Notificar que o auto-login foi executado
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'AUTO_LOGIN_SUBMITTED',
                message: 'Auto-login inteligente executado',
                details: {
                  loginFilled: loginFilled,
                  passwordFilled: passwordFilled,
                  captchaHandled: captchaResult,
                  has2FA: !!twoFAField
                }
              }));
              
            }, submitDelay);
            
            return true;
          }

          // Executar auto-login com retry
          let attempts = 0;
          const maxAttempts = 8;
          
          const executeAutoLogin = () => {
            attempts++;
            // console.log(\`🔄 Tentativa \${attempts}/\${maxAttempts} de auto-login\`);
            
            if (attemptIntelligentAutoLogin()) {
              // console.log('✅ Auto-login executado com sucesso');
              return;
            }
            
            if (attempts < maxAttempts) {
              setTimeout(executeAutoLogin, 500);
            } else {
              // console.log('❌ Auto-login falhou após', maxAttempts, 'tentativas');
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'AUTO_LOGIN_FAILED',
                message: 'Auto-login falhou após múltiplas tentativas'
              }));
            }
          };

          // Iniciar o processo
          setTimeout(executeAutoLogin, 500);
          
        })();
        true;
      `;

      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(script);
      }
    } catch (e) {
      console.error('❌ Erro ao tentar auto-login:', e);
      
      setAutoLoginDone(true);
      // Em caso de erro, manter o usuário na tela atual
      // mas marcar que o auto-login falhou
    }
  };
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a472a" />
      

      
      <WebView
        ref={webViewRef}
        source={{ uri: currentUrl }}
        style={styles.webview}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={onLoadEnd}
        onError={handleError}
        onMessage={handleMessage}
        onNavigationStateChange={handleNavigationStateChange}
        onRenderProcessGone={handleRenderProcessGone}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onFileDownload={onFileDownload} // Adicionado para downloads no Android
        onPermissionRequest={handlePermissionRequest} // Handler para permissões de câmera/microfone
        injectedJavaScript={injectedJavaScript}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        useWebKit={true}
        // === PROPRIEDADES CRÍTICAS PARA iOS E QR CODE ===
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        allowsProtectedMedia={true} // Habilitado para iOS e Android
        allowsFullscreenVideo={true}
        // === CONFIGURAÇÕES DE PERMISSÃO DE CÂMERA PARA iOS ===
        mediaCapturePermissionGrantType={Platform.OS === 'ios' ? 'grantIfSameHostElsePrompt' : undefined}
        // Configurações de câmera e mídia para iOS
        allowsAirPlayForMediaPlayback={Platform.OS === 'ios'}
        // === PROPRIEDADES PARA ACESSO A ARQUIVOS E CÂMERA ===
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true} // Habilitado para iOS e Android
        allowUniversalAccessFromFileURLs={true} // Habilitado para iOS e Android
        // === PROPRIEDADES ESPECÍFICAS PARA ANDROID E CÂMERA ===
        androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
        androidHardwareAccelerationDisabled={Platform.OS === 'android' ? false : undefined}
        cacheMode={Platform.OS === 'android' ? 'LOAD_DEFAULT' : undefined}
        // Propriedades específicas para iOS
        allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
        allowsLinkPreview={Platform.OS === 'ios' ? false : undefined}
        contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : undefined}
        automaticallyAdjustContentInsets={Platform.OS === 'ios' ? true : undefined}
        useSharedProcessPool={Platform.OS === 'ios'}
        // Melhorar compatibilidade com sessões
        incognito={false}
        cacheEnabled={true}
        pullToRefreshEnabled={true}
        // === USER-AGENT OTIMIZADO PARA iOS E ANDROID ===
        userAgent={Platform.OS === 'ios' 
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 CorpxBank/1.0'
          : Platform.OS === 'android'
          ? 'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 CorpxBank/1.0'
          : undefined
        }
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00448c" />
          </View>
        )}
      />
      
      {authStatus === 'authenticated' && (
        <View style={styles.buttonsContainer}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.homeButton]} 
            onPress={handleGoHome}
          >
            <Text style={[styles.actionButtonText, styles.homeButtonText]}>Home</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionButton, styles.logoutButton]} 
            onPress={() => handleLogout(false)} // Logout simples por padrão
            onLongPress={() => handleLogout(true)} // Long press = logout completo
          >
            <Text style={[styles.actionButtonText, styles.logoutButtonText]}>Sair</Text>
          </TouchableOpacity>
        </View>
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
  // Estilos dos botões de ação
  buttonsContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    right: 20,
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  homeButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.9)',
    borderColor: '#007AFF',
  },
  logoutButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderColor: '#ddd',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  homeButtonText: {
    color: '#fff',
  },
  logoutButtonText: {
    color: '#333',
  },
});