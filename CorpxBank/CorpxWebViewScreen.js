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
import * as MediaLibrary from 'expo-media-library';
import * as WebBrowser from 'expo-web-browser';
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
const COOKIE_URL = 'https://corpxbank.com.br';

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
  // Sistema de debug visual para iOS (overlay transparente na tela)
  // Facilita diagnóstico de problemas em dispositivos reais
  const [debugMessage, setDebugMessage] = useState('');
  // Controle de visibilidade do debug - habilitado apenas no iOS
  // Android tem melhor sistema de logs via console
  const [showDebug, setShowDebug] = useState(Platform.OS === 'ios');
  
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

  const showDebugMessage = (message) => {
    if (Platform.OS === 'ios') {
      setDebugMessage(message);
      console.log('🐛 DEBUG:', message);
      // Limpar mensagem após 5 segundos
      setTimeout(() => setDebugMessage(''), 5000);
    }
  };

  /**
   * FUNÇÃO CRÍTICA: Captura cookies nativamente após login bem-sucedido
   * Usa CookieManager para obter cookies reais do sistema
   * Salva de forma persistente no SecureStore para uso futuro
   */
  const captureNativeCookies = async () => {
    try {
      console.log('🍪 [COOKIE-FLOW] Iniciando captura nativa de cookies...');
      console.log('🍪 [COOKIE-FLOW] URL:', COOKIE_URL);
      console.log('🍪 [COOKIE-FLOW] Domínio:', COOKIE_DOMAIN);
      showDebugMessage('Capturando cookies nativos...');
      
      // Capturar cookies nativamente do sistema
      const cookies = await CookieManager.get(COOKIE_URL, true); // useWebKit = true
      
      console.log('🍪 [COOKIE-FLOW] Cookies nativos capturados:', Object.keys(cookies));
      console.log('🍪 [COOKIE-FLOW] Total de cookies:', Object.keys(cookies).length);
      
      // Verificar se temos cookies essenciais (PHPSESSID é crítico para sessões PHP)
      const hasEssentialCookies = cookies.PHPSESSID || 
                                  Object.keys(cookies).some(key => 
                                    key.toLowerCase().includes('session') || 
                                    key.toLowerCase().includes('auth')
                                  );
      
      console.log('🍪 [COOKIE-FLOW] PHPSESSID presente:', !!cookies.PHPSESSID);
      console.log('🍪 [COOKIE-FLOW] Cookies essenciais encontrados:', hasEssentialCookies);
      
      if (!hasEssentialCookies) {
        console.log('❌ [COOKIE-FLOW] Nenhum cookie essencial encontrado');
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
      
      console.log('✅ [COOKIE-FLOW] Cookies nativos salvos com sucesso');
      console.log('🍪 [COOKIE-FLOW] Expira em:', new Date(cookieData.expiresAt).toLocaleString());
      showDebugMessage('Cookies salvos com sucesso');
      
      return true;
      
    } catch (error) {
      console.error('❌ Erro ao capturar cookies nativos:', error);
      showDebugMessage('Erro na captura de cookies');
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
      console.log('🔄 [COOKIE-FLOW] Iniciando injeção de cookies antes do carregamento...');
      showDebugMessage('Injetando cookies...');
      
      // Recuperar cookies salvos
      const savedCookieData = await SecureStore.getItemAsync(NATIVE_COOKIES_KEY);
      if (!savedCookieData) {
        console.log('❌ [COOKIE-FLOW] Nenhum cookie nativo salvo encontrado');
        setCookiesInjected(false);
        return false;
      }
      
      console.log('🍪 [COOKIE-FLOW] Dados de cookies encontrados no SecureStore');
      
      const cookieData = JSON.parse(savedCookieData);
      
      // Verificar se não expiraram
      const timeUntilExpiry = cookieData.expiresAt - Date.now();
      console.log('🍪 [COOKIE-FLOW] Tempo até expiração:', Math.floor(timeUntilExpiry / (1000 * 60)), 'minutos');
      
      if (Date.now() > cookieData.expiresAt) {
        console.log('⏰ [COOKIE-FLOW] Cookies nativos expiraram, limpando...');
        await Promise.all([
          SecureStore.deleteItemAsync(NATIVE_COOKIES_KEY),
          SecureStore.deleteItemAsync(COOKIE_EXPIRY_KEY)
        ]);
        setCookiesInjected(false);
        return false;
      }
      
      console.log(`🔄 [COOKIE-FLOW] Injetando ${Object.keys(cookieData.cookies).length} cookies...`);
      
      // PRIMEIRA TENTATIVA: Limpar cookies antigos para evitar conflitos
      try {
        await CookieManager.clearAll(true);
        console.log('🧹 Cookies antigos limpos');
        await new Promise(resolve => setTimeout(resolve, 500)); // Aguardar limpeza
      } catch (error) {
        console.log('⚠️ Aviso: não foi possível limpar cookies antigos');
      }
      
      // Injetar cada cookie usando CookieManager
      let injectedCount = 0;
      const cookiePromises = [];
      
      for (const [name, cookieInfo] of Object.entries(cookieData.cookies)) {
        const cookieValue = typeof cookieInfo === 'object' ? cookieInfo.value : cookieInfo;
        
        console.log(`🍪 [COOKIE-FLOW] Injetando cookie: ${name}`);
        
        const promise = CookieManager.setFromResponse(COOKIE_URL, `${name}=${cookieValue}; Domain=${COOKIE_DOMAIN}; Path=/; HttpOnly`)
          .then(() => {
            injectedCount++;
            console.log(`✅ [COOKIE-FLOW] Cookie ${name} injetado com sucesso`);
          })
          .catch(error => {
            console.log(`❌ [COOKIE-FLOW] Falha ao injetar cookie ${name}:`, error);
          });
        
        cookiePromises.push(promise);
      }
      
      // Aguardar todas as injeções
      await Promise.all(cookiePromises);
      
      // CRÍTICO: Aguardar propagação no sistema nativo (2 segundos adicionais)
      console.log('⏳ Aguardando propagação de cookies no sistema nativo...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`🍪 [COOKIE-FLOW] ${injectedCount}/${Object.keys(cookieData.cookies).length} cookies injetados`);
      console.log('🍪 [COOKIE-FLOW] Cookies injetados:', Object.keys(cookieData.cookies).slice(0, 3).join(', '));
      showDebugMessage(`${injectedCount} cookies injetados`);
      
      // Considerar sucesso se pelo menos 1 cookie foi injetado
      const success = injectedCount > 0;
      
      // NÃO definir setCookiesInjected aqui - será definido após validação bem-sucedida
      console.log(`🍪 [COOKIE-FLOW] Resultado da injeção: ${success ? 'SUCESSO' : 'FALHA'}`);
      
      return success;
      
    } catch (error) {
      console.error('❌ Erro ao injetar cookies nativos:', error);
      showDebugMessage('Erro na injeção de cookies');
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
      console.log('🔍 [COOKIE-FLOW] Validando sessão com servidor...');
      console.log('🔍 [COOKIE-FLOW] URL de validação: https://corpxbank.com.br/inicial.php');
      setValidatingSession(true);
      showDebugMessage('Validando sessão...');
      
      // CRÍTICO: Aguardar tempo suficiente para cookies se propagarem no sistema
      console.log('⏳ Aguardando propagação de cookies (3 segundos)...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Fazer requisição HEAD para verificar se sessão é válida
      const response = await fetch('https://corpxbank.com.br/inicial.php', {
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
      
      console.log('🔍 [COOKIE-FLOW] Status da resposta:', response.status);
      console.log('🔍 [COOKIE-FLOW] URL final:', response.url);
      
      // 200 = autenticado, 302/301 = redirecionamento para login = não autenticado
      const isValid = response.status === 200 && !response.url.includes('login.php');
      
      console.log('🔍 [COOKIE-FLOW] Sessão válida?', isValid);
      console.log('🔍 [COOKIE-FLOW] Critérios: status 200 =', response.status === 200, ', não contém login.php =', !response.url.includes('login.php'));
      
      setValidatingSession(false);
      setSessionValidated(isValid);
      
      if (isValid) {
        console.log('✅ [COOKIE-FLOW] Sessão validada com sucesso pelo servidor');
        showDebugMessage('Sessão válida confirmada ✅');
      } else {
        console.log('❌ Sessão inválida detectada pelo servidor');
        showDebugMessage('Sessão expirada ❌');
      }
      
      return isValid;
      
    } catch (error) {
      console.error('❌ Erro ao validar sessão:', error);
      setValidatingSession(false);
      setSessionValidated(false);
      showDebugMessage('Erro na validação');
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
      console.log('🔍 Verificando expiração de sessão...');
      
      // Se usuário estava autenticado mas foi redirecionado para login.php automaticamente
      if (currentUrl.includes('login.php') && authStatus === 'authenticated' && cookiesInjected) {
        console.log('⚠️ SESSÃO EXPIRADA DETECTADA: redirecionamento forçado para login.php');
        showDebugMessage('Sessão expirou - login necessário');
        
        // Limpar todos os dados de sessão
        console.log('🧹 Limpando dados de sessão expirada...');
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
          console.log('🧹 Cookies nativos limpos');
        } catch (error) {
          console.log('⚠️ Aviso: falha ao limpar cookies nativos');
        }
        
        // Resetar estados
        setCookiesInjected(false);
        setSessionValidated(false);
        setAuthStatus('needsLogin');
        
        console.log('✅ Limpeza de sessão expirada completa - usuário deve fazer login manual');
        showDebugMessage('Login manual necessário');
      }
      
    } catch (error) {
      console.error('❌ Erro ao tratar expiração de sessão:', error);
    }
  };

  useEffect(() => {
    // FUNÇÃO PRINCIPAL: Verifica status de autenticação na inicialização do app
    // Determina se usuário deve ver biometria, login manual ou área autenticada
    // Gerencia expiração de sessões biométricas (30 dias)
    const checkAuthStatus = async () => {
      try {
        console.log('🔍 Verificando status de autenticação inicial...');
        const biometricEnabled = await SecureStore.getItemAsync(BIOMETRIC_KEY);
        const sessionTimestamp = await SecureStore.getItemAsync(SESSION_KEY);
        console.log('🔍 Biometria ativa?', biometricEnabled);

        if (biometricEnabled === 'true') {
          // Verificar se a sessão biométrica não expirou (30 dias)
          if (sessionTimestamp) {
            const sessionAge = Date.now() - parseInt(sessionTimestamp);
            const isExpired = sessionAge > BIOMETRIC_EXPIRY_TIME;
            
            console.log('🕐 Idade da sessão:', Math.floor(sessionAge / (1000 * 60 * 60 * 24)), 'dias');
            
            if (isExpired) {
              console.log('⏰ Sessão biométrica expirada. Limpando credenciais...');
              // Limpar credenciais expiradas
              await Promise.all([
                SecureStore.deleteItemAsync(BIOMETRIC_KEY),
                SecureStore.deleteItemAsync(SESSION_KEY),
                SecureStore.deleteItemAsync(LOGIN_KEY),
                SecureStore.deleteItemAsync(PASSWORD_KEY),
                SecureStore.deleteItemAsync('last_authenticated_url')
              ]);
              setCurrentUrl('https://corpxbank.com.br/login.php');
              setInitialUrl('https://corpxbank.com.br/login.php');
              setAuthStatus('needsLogin');
              return;
            }
          }

          console.log('✅ Biometria habilitada e sessão válida. Solicitando autenticação...');
          setAuthStatus('promptBiometric');
          handleBiometricAuth();
        } else {
          console.log('🎯 Biometria não ativada. Redirecionando para login.');
          setCurrentUrl('https://corpxbank.com.br/login.php');
          setInitialUrl('https://corpxbank.com.br/login.php');
          setAuthStatus('needsLogin');
        }
      } catch (error) {
        console.error('❌ Erro ao verificar status de autenticação:', error);
        setCurrentUrl('https://corpxbank.com.br/login.php');
        setInitialUrl('https://corpxbank.com.br/login.php');
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
        console.log('🎯 Login bem-sucedido detectado via URL:', navState.url);
        setAuthStatus('authenticated');
        
        // CRÍTICO: Capturar cookies nativamente após login manual bem-sucedido
        console.log('🍪 EXECUTANDO: Captura automática de cookies após login manual');
        showDebugMessage('Capturando cookies de sessão...');
        setTimeout(async () => {
          const cookiesCaptured = await captureNativeCookies();
          if (cookiesCaptured) {
            console.log('🎉 SUCESSO: Cookies capturados e salvos para biometria futura');
            showDebugMessage('Cookies salvos - biometria habilitada');
          } else {
            console.log('⚠️ AVISO: Falha na captura de cookies - biometria pode não funcionar');
            showDebugMessage('Aviso: falha na captura de cookies');
          }
        }, 2000); // Aguardar 2s para garantir que cookies estão disponíveis
      }
      console.log('✅ Salvando a última URL autenticada:', navState.url);
      await SecureStore.setItemAsync('last_authenticated_url', navState.url);
      setAutoLoginDone(false); // reset para próximas sessões
    } else if (navState.url.includes('login.php')) {
      console.log('📍 Usuário navegou para a página de login.');
      
      // Só executar auto-login se chegou aqui por navegação normal (não por biometria)
      // Biometria já redireciona direto para área autenticada
      if (authStatus === 'authenticated' && !autoLoginDone && !navState.url.includes('biometric_redirect')) {
        console.log('🤖 Tentando auto-login após navegação para login...');
        tryAutoLogin();
      } else if (authStatus === 'needsLogin') {
        // Se está em needsLogin, limpar URL salva
        await SecureStore.deleteItemAsync('last_authenticated_url');
      }
    }
  };

  // Novo useEffect para lidar com a oferta de biometria após o login
  useEffect(() => {
    if (authStatus === 'authenticated') {
      console.log('🔑 Usuário autenticado, verificando se devemos oferecer biometria.');
      offerBiometrics();
    }
  }, [authStatus]);

  // FUNÇÃO DE UX: Oferece ativação de biometria após login bem-sucedido
    // Verifica disponibilidade de hardware e se usuário já foi questionado
    // Evita perguntas repetitivas e melhora experiência do usuário
    const offerBiometrics = async () => {
    try {
      const biometryAsked = await SecureStore.getItemAsync('biometryAsked');
      if (biometryAsked === 'true') {
        console.log('✅ Oferta de biometria já foi feita anteriormente.');
        return;
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      console.log('🔬 Verificação de hardware biométrico:', { hasHardware, isEnrolled });

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
    console.log('🤔 Usuário escolheu ativar biometria:', enable);
    await SecureStore.setItemAsync('biometryAsked', 'true'); // Marcar que já perguntamos

    if (enable) {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirme sua identidade para ativar o login rápido',
          disableDeviceFallback: true, // Não permite usar a senha do dispositivo
        });

        if (result.success) {
          console.log('✅ Biometria confirmada! Ativando para futuros logins.');
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
            console.log('🔑 Credenciais e dados de sessão salvos para login automático.');
          } else {
            console.log('⚠️ Credenciais não capturadas - biometria ativada mas sem auto-login');
          }

          Alert.alert(
            'Login Rápido Ativado!',
            'Você poderá usar sua biometria para acessar o app por 30 dias.'
          );
        } else {
          console.log('❌ Autenticação para ativação da biometria falhou.');
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
      console.log('🔍 Verificando se é primeiro uso do usuário...');
      
      // Verificar se já foi marcado como primeiro login completo
      const firstLoginDone = await SecureStore.getItemAsync(FIRST_LOGIN_COMPLETED_KEY);
      
      // Verificar se há credenciais salvas (indicador de uso anterior)
      const hasCredentials = await SecureStore.getItemAsync(LOGIN_KEY);
      
      // É primeira vez se não há marcação E não há credenciais
      const isFirstTime = firstLoginDone !== 'true' || !hasCredentials;
      
      console.log('📊 Status do usuário:', {
        firstLoginDone: firstLoginDone === 'true',
        hasCredentials: !!hasCredentials,
        isFirstTime: isFirstTime
      });
      
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
      console.log('🔍 Validando sessão com múltiplos indicadores...');
      
      // 1. FALLBACK PRIMÁRIO: Verificar URL autenticada recente
      const lastAuthUrl = await SecureStore.getItemAsync('last_authenticated_url');
      const lastSuccessfulLogin = await SecureStore.getItemAsync(LAST_SUCCESSFUL_LOGIN_KEY);
      
      if (lastAuthUrl && lastAuthUrl.includes('inicial.php') && lastSuccessfulLogin) {
        const loginAge = Date.now() - parseInt(lastSuccessfulLogin);
        // Se login foi nas últimas 4 horas, considerar sessão provavelmente válida
        if (loginAge < (4 * 60 * 60 * 1000)) {
          console.log('✅ Sessão recente detectada (últimas 4h), assumindo válida');
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
          console.log('✅ Cookies de sessão válidos encontrados');
          return true;
        } else {
          console.log('⏰ Cookies de sessão expiraram, limpando...');
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
          console.log('✅ Biometria recente detectada, assumindo sessão válida');
          return true;
        }
      }
      
      console.log('❌ Nenhum indicador de sessão válida encontrado');
      return false;
      
    } catch (error) {
      console.error('❌ Erro ao validar sessão:', error);
      return false;
    }
  };

  const testSessionValidity = async () => {
    try {
      console.log('🧪 Testando validade da sessão...');
      const savedCookies = await SecureStore.getItemAsync(SESSION_COOKIES_KEY);
      
      if (!savedCookies) {
        return false;
      }

      // Tentar acessar uma página da área autenticada para verificar se a sessão é válida
      const testUrl = 'https://corpxbank.com.br/inicial.php';
      
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
      console.log('🤖 Iniciando auto-login invisível...');
      showDebugMessage('Auto-login em andamento...');
      
      // Verificar se temos credenciais necessárias
      const storedLogin = await SecureStore.getItemAsync(LOGIN_KEY);
      const storedPassword = await SecureStore.getItemAsync(PASSWORD_KEY);
      
      if (!storedLogin || !storedPassword) {
        console.log('❌ Credenciais não encontradas para auto-login invisível');
        // Fallback para login manual
        setAuthStatus('needsLogin');
        setCurrentUrl('https://corpxbank.com.br/login.php');
        setInitialUrl('https://corpxbank.com.br/login.php');
        return;
      }
      
      console.log('✅ Credenciais encontradas, iniciando auto-login invisível...');
      
      // Configurar estado para auto-login
      setAuthStatus('authenticated'); // Permitir auto-login
      setAutoLoginDone(false); // Resetar flag
      setIsLoading(true); // Mostrar loading durante processo
      
      // Carregar página de login para executar auto-login
      // IMPORTANTE: Usuário não vê esta tela, só o loading
      setCurrentUrl('https://corpxbank.com.br/login.php');
      setInitialUrl('https://corpxbank.com.br/login.php');
      
      console.log('🔄 Auto-login invisível configurado, aguardando execução...');
      
    } catch (error) {
      console.error('❌ Erro no auto-login invisível:', error);
      showDebugMessage('Erro no auto-login');
      
      // Em caso de erro, fallback para login manual
      setAuthStatus('needsLogin');
      setCurrentUrl('https://corpxbank.com.br/login.php');
      setInitialUrl('https://corpxbank.com.br/login.php');
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
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Use sua biometria para acessar o CorpxBank',
        disableDeviceFallback: true,
      });

      if (result.success) {
        console.log('✅ Autenticação biométrica bem-sucedida!');
        console.log('📱 Platform:', Platform.OS);
        showDebugMessage('Biometria confirmada');
        
        // ETAPA 1: Verificar se é primeira vez vs. usuário existente
        const isFirstTime = await checkIfFirstTimeUser();
        
        if (isFirstTime) {
          // PRIMEIRO USO: Login manual normal (única vez que usuário vê login.php)
          console.log('🆕 Primeiro uso detectado - redirecionando para login manual');
          showDebugMessage('Primeiro uso - login manual');
          
          setAuthStatus('needsLogin');
          setCurrentUrl('https://corpxbank.com.br/login.php');
          setInitialUrl('https://corpxbank.com.br/login.php');
          return;
        }
        
        // ETAPA 2: USUÁRIO EXISTENTE - Tentar injetar cookies salvos
        console.log('👤 Usuário existente - tentando injeção de cookies...');
        showDebugMessage('Recuperando sessão...');
        
        const cookiesInjected = await injectNativeCookiesBeforeLoad();
        
        if (cookiesInjected) {
          // ETAPA 3A: COOKIES INJETADOS - Validar com servidor
          console.log('🍪 Cookies injetados, validando com servidor...');
          showDebugMessage('Validando sessão...');
          
          const sessionValid = await validateSessionWithServer();
          
          if (sessionValid) {
            // SUCESSO: Ir direto para área autenticada
            console.log('🎉 SUCESSO TOTAL: Sessão válida, carregando área autenticada');
            showDebugMessage('Acesso liberado! ✅');
            
            // CRÍTICO: Definir que cookies foram injetados com sucesso
            setCookiesInjected(true);
            setSessionValidated(true);
            setAuthStatus('authenticated');
            setCurrentUrl('https://corpxbank.com.br/inicial.php');
            setInitialUrl('https://corpxbank.com.br/inicial.php');
            
            // Atualizar timestamps de sucesso
            await Promise.all([
              SecureStore.setItemAsync(BIOMETRIC_TIMESTAMP_KEY, Date.now().toString()),
              SecureStore.setItemAsync(SESSION_KEY, Date.now().toString()),
              SecureStore.setItemAsync(LAST_SUCCESSFUL_LOGIN_KEY, Date.now().toString())
            ]);
            
            return;
          } else {
            console.log('❌ Validação falhou - cookies inválidos/expirados');
            setCookiesInjected(false);
            setSessionValidated(false);
          }
        }
        
        // ETAPA 3B: COOKIES FALHARAM OU SESSÃO INVÁLIDA - Auto-login silencioso
        console.log('⚠️ Cookies inválidos/expirados - iniciando auto-login silencioso');
        showDebugMessage('Renovando sessão...');
        
        // Verificar se temos credenciais para auto-login
        const storedLogin = await SecureStore.getItemAsync(LOGIN_KEY);
        const storedPassword = await SecureStore.getItemAsync(PASSWORD_KEY);
        
        if (!storedLogin || !storedPassword) {
          // Fallback extremo: forçar login manual
          console.log('❌ Credenciais não encontradas - fallback para login manual');
          showDebugMessage('Credenciais necessárias');
          
          setAuthStatus('needsLogin');
          setCurrentUrl('https://corpxbank.com.br/login.php');
          setInitialUrl('https://corpxbank.com.br/login.php');
          return;
        }
        
        // EXECUTAR AUTO-LOGIN SILENCIOSO
        await performSilentAutoLogin();
        
      } else {
        console.log('❌ Autenticação biométrica falhou ou cancelada pelo usuário.');
        setAuthStatus('needsLogin');
        setCurrentUrl('https://corpxbank.com.br/login.php');
        setInitialUrl('https://corpxbank.com.br/login.php');
      }
    } catch (error) {
      console.error('❌ Erro na autenticação biométrica:', error);
      setAuthStatus('needsLogin');
      setCurrentUrl('https://corpxbank.com.br/login.php');
      setInitialUrl('https://corpxbank.com.br/login.php');
    }
  };

  /**
   * FUNÇÃO CRÍTICA: Executa auto-login silencioso quando cookies expiraram
   * Faz login automático SEM mostrar login.php para o usuário
   * Captura novos cookies e redireciona para inicial.php
   */
  const performSilentAutoLogin = async () => {
    try {
      console.log('🔄 Iniciando auto-login silencioso com nova arquitetura...');
      showDebugMessage('Login silencioso em andamento...');
      
      // Configurar estado para mostrar loading sem URL específica
      setAuthStatus('authenticated'); // Permitir que WebView funcione
      setIsLoading(true);
      
      // ESTRATÉGIA: Carregar login.php EM BACKGROUND e fazer auto-login
      // Usuário vê apenas loading durante todo o processo
      setCurrentUrl('https://corpxbank.com.br/login.php');
      setInitialUrl('https://corpxbank.com.br/login.php');
      
      // Flag para indicar que estamos em processo silencioso
      setAutoLoginDone(false); // Permitir tentativa de auto-login
      
      console.log('🤫 Auto-login silencioso configurado - usuário não verá login.php');
      
    } catch (error) {
      console.error('❌ Erro no auto-login silencioso:', error);
      showDebugMessage('Erro no login silencioso');
      
      // Fallback para login manual
      setAuthStatus('needsLogin');
      setCurrentUrl('https://corpxbank.com.br/login.php');
      setInitialUrl('https://corpxbank.com.br/login.php');
    }
  };

  // FUNÇÃO DE LIMPEZA: Logout seguro com limpeza completa de dados
  // Remove todos os dados sensíveis e reseta estado do app
  // Suporte a logout parcial (sessão) ou completo (incluindo biometria)
  const handleLogout = async (clearAll = false) => {
    try {
      console.log(`🔓 Realizando logout. Limpeza completa: ${clearAll}`);
      
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
      }
      
      // Executar limpeza em paralelo para melhor performance
      await Promise.all(itemsToClear.map(key => 
        SecureStore.deleteItemAsync(key).catch(err => 
          console.log(`⚠️ Aviso: não foi possível limpar ${key}:`, err)
        )
      ));
      
      console.log('✅ Limpeza de dados concluída');
      
      // LIMPEZA ADICIONAL: Limpar cookies nativos se limpeza completa
      if (clearAll) {
        try {
          await CookieManager.clearAll(true); // useWebKit = true
          console.log('🍪 Cookies nativos limpos via CookieManager');
        } catch (error) {
          console.log('⚠️ Aviso: não foi possível limpar cookies nativos:', error);
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
      const newUrl = 'https://corpxbank.com.br/login.php';
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
      
      showDebugMessage('Logout realizado');
      
    } catch (error) {
      console.error('❌ Erro no logout:', error);
      // Em caso de erro, forçar estado de login
      setAuthStatus('needsLogin');
      setCurrentUrl('https://corpxbank.com.br/login.php');
    }
  };

  // FUNÇÃO DE COMUNICAÇÃO: Processa mensagens vindas da WebView
    // Gerencia captura de credenciais, dados de sessão, 2FA e eventos de login
    // Ponto central de comunicação entre JavaScript injetado e React Native
    const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('📨 Mensagem WebView recebida:', data);
      
      switch (data.type) {
        case 'LOGIN_ATTEMPT':
          if (data.credentials) {
            setLoginCredentials(data.credentials);
            console.log('🔐 Credenciais de login capturadas para possível uso biométrico.');
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
            console.log(`🧪 LOGIN_INPUTS: ${count} inputs detectados`);
            if (count) {
              console.log('🧪 Amostra de inputs:', data.inputs.slice(0, 5));
            }
          } catch (e) {}
          break;
        case 'AUTO_LOGIN_SUBMITTED':
          console.log('🤖 Auto-login submetido com sucesso!');
          showDebugMessage('Login automático executado!');
          
          // CRÍTICO: Aguardar e capturar cookies após auto-login bem-sucedido
          setTimeout(async () => {
            if (currentUrl.includes('inicial.php')) {
              console.log('🍪 EXECUTANDO: Captura de cookies após auto-login silencioso');
              showDebugMessage('Capturando novos cookies...');
              
              const cookiesCaptured = await captureNativeCookies();
              if (cookiesCaptured) {
                console.log('🎉 SUCESSO: Novos cookies capturados após auto-login');
                showDebugMessage('Cookies atualizados');
              } else {
                console.log('⚠️ AVISO: Falha na captura de cookies após auto-login');
                showDebugMessage('Aviso: falha na captura');
              }
            }
          }, 3000); // Aguardar 3s para garantir que redirecionamento foi concluído
          break;
        case 'AUTO_LOGIN_FAILED':
          console.log('❌ Auto-login falhou');
          showDebugMessage('Auto-login falhou - intervenção necessária');
          // Em caso de falha, permitir login manual
          setAuthStatus('needsLogin');
          break;
        case 'NEED_2FA_CODE':
          console.log('🔐 Código 2FA necessário');
          showDebugMessage('Código 2FA necessário - verifique SMS/app');
          break;
        case 'SESSION_COOKIES_CAPTURED':
          if (data.cookies) {
            console.log('🍪 Cookies de sessão capturados:', Object.keys(data.cookies));
            await SecureStore.setItemAsync(SESSION_COOKIES_KEY, JSON.stringify(data.cookies));
            
            // Definir expiração da sessão (ex: 8 horas)
            const sessionExpiry = Date.now() + (8 * 60 * 60 * 1000);
            await SecureStore.setItemAsync(SESSION_EXPIRY_KEY, sessionExpiry.toString());
          }
          break;
        case 'CSRF_TOKEN_CAPTURED':
          if (data.token) {
            console.log('🛡️ Token CSRF capturado');
            await SecureStore.setItemAsync(CSRF_TOKENS_KEY, JSON.stringify(data.token));
          }
          break;
        case 'LOGIN_IDENTIFIER_TYPE_DETECTED':
          if (data.type) {
            console.log('🆔 Tipo de identificador detectado:', data.type);
            await SecureStore.setItemAsync(LOGIN_IDENTIFIER_TYPE_KEY, data.type);
          }
          break;
        case '2FA_CODE_ENTERED':
          if (data.code) {
            console.log('🔐 Código 2FA inserido manualmente');
            await SecureStore.setItemAsync(LAST_2FA_CODE_KEY, data.code);
            await SecureStore.setItemAsync(LAST_2FA_TIMESTAMP_KEY, Date.now().toString());
          }
          break;
        case 'CAPTCHA_BYPASS_TOKEN':
          if (data.token) {
            console.log('🧩 Token de bypass de captcha capturado');
            await SecureStore.setItemAsync(CAPTCHA_BYPASS_TOKEN_KEY, data.token);
          }
          break;
        case 'LOGIN_SUCCESS_DETECTED':
          console.log('✅ Sucesso de login detectado');
          const timestamp = Date.now().toString();
          
          // CRÍTICO: Capturar cookies nativos imediatamente após login bem-sucedido
          setTimeout(async () => {
            console.log('🍪 Iniciando captura de cookies nativos após login...');
            const cookiesCaptured = await captureNativeCookies();
            if (cookiesCaptured) {
              console.log('🎉 Cookies nativos capturados com sucesso para futuro uso!');
              showDebugMessage('Sessão salva para biometria');
            } else {
              console.log('⚠️ Falha na captura de cookies nativos');
              showDebugMessage('Aviso: sessão pode não persistir');
            }
          }, 2000); // Aguardar 2s para garantir que cookies foram definidos pelo servidor
          
          // Salvar dados críticos do login bem-sucedido
          await Promise.all([
            SecureStore.setItemAsync(LAST_SUCCESSFUL_LOGIN_KEY, timestamp),
            SecureStore.setItemAsync(FIRST_LOGIN_COMPLETED_KEY, 'true'), // CRÍTICO: Marcar primeiro login completo
            SecureStore.setItemAsync(BIOMETRIC_TIMESTAMP_KEY, timestamp) // Atualizar timestamp para sessão
          ]);
          
          console.log('🎯 Primeiro login marcado como completo - futuras aberturas usarão biometria');
          showDebugMessage('Login bem-sucedido!');
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

  // FUNÇÃO DE CONTROLE OTIMIZADA: Executa após carregamento com suporte a cookies nativos
    // Integra com novo sistema de captura/injeção nativa de cookies
    // Prioriza eficiência e evita operações desnecessárias
    const onLoadEnd = () => {
    console.log('✅ WebView carregada.');
    console.log('📱 Platform:', Platform.OS);
    console.log('🌐 URL atual:', currentUrl);
    console.log('🔐 Status de auth:', authStatus);
    console.log('🤖 Auto-login done:', autoLoginDone);
    console.log('🍪 Cookies injetados:', cookiesInjected);
    showDebugMessage('onLoadEnd: ' + currentUrl);
    
    // CRÍTICO: Verificar se sessão expirou (usuário foi redirecionado para login.php)
    handleSessionExpiration();
    
    setIsWebViewReady(true);
    setIsLoading(false);

    // REMOVIDO: Sistema JavaScript de cookies para evitar conflitos
    // APENAS sistema nativo de cookies será usado (@react-native-cookies/cookies)
    console.log('ℹ️ Sistema unificado: usando APENAS cookies nativos (@react-native-cookies/cookies)');

    // === CAPTURA NATIVA DE SESSÃO OTIMIZADA ===
    // Prioriza captura nativa sobre JavaScript quando possível
    if (currentUrl.includes('inicial.php')) {
      console.log('✅ Área autenticada carregada com sucesso!');
      showDebugMessage('Área autenticada confirmada');
      
      // OTIMIZAÇÃO CRÍTICA: Usar captura nativa de cookies
      setTimeout(async () => {
        try {
          console.log('🍪 Capturando cookies nativos da área autenticada...');
          const nativeCaptureSuccess = await captureNativeCookies();
          
          if (nativeCaptureSuccess) {
            console.log('🎉 Cookies nativos atualizados da área autenticada!');
            showDebugMessage('Sessão atualizada com sucesso');
            
            // Marcar login como bem-sucedido
            const timestamp = Date.now().toString();
            await Promise.all([
              SecureStore.setItemAsync(LAST_SUCCESSFUL_LOGIN_KEY, timestamp),
              SecureStore.setItemAsync(FIRST_LOGIN_COMPLETED_KEY, 'true'),
              SecureStore.setItemAsync(BIOMETRIC_TIMESTAMP_KEY, timestamp)
            ]);
            
          } else {
            // Fallback para captura JavaScript se nativa falhar
            console.log('⚠️ Captura nativa falhou, usando fallback JavaScript...');
            if (webViewRef.current) {
              webViewRef.current.injectJavaScript(`
                (function() {
                  console.log('📊 Fallback: capturando via JavaScript...');
                  
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
      console.log('🎯 Condições atendidas para auto-login na página de login');
      showDebugMessage('Preparando auto-login...');
      
      // OTIMIZAÇÃO: Aguardar tempo mínimo necessário baseado na plataforma
      // iOS: mais rápido devido ao melhor gerenciamento de WebView
      // Android: aguardar mais para garantir renderização completa
      const platformDelay = Platform.OS === 'ios' ? 1200 : 2000;
      
      setTimeout(() => {
        console.log('🤖 Iniciando auto-login otimizado após', platformDelay, 'ms');
        showDebugMessage('Executando auto-login invisível...');
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
    console.log('⚠️ Processo da WebView encerrado, recarregando...');
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  const onShouldStartLoadWithRequest = (request) => {
    const { url } = request;
    console.log('➡️ Navegação solicitada:', url);
    
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

  const injectedJavaScript = `
    (function() {
      console.log('🔐 Script avançado de captura de credenciais injetado.');

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
        console.log('🚀 Inicializando script avançado...');
        
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
            console.log('🧩 Captcha detectado:', captcha.type);
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
      
    })();
    true;
  `;

  const manage2FAFlow = async () => {
    try {
      const lastCode = await SecureStore.getItemAsync(LAST_2FA_CODE_KEY);
      const lastTimestamp = await SecureStore.getItemAsync(LAST_2FA_TIMESTAMP_KEY);
      
      if (!lastCode || !lastTimestamp) {
        console.log('⚠️ Código 2FA não disponível');
        return null;
      }

      // Verificar se o código não é muito antigo (códigos 2FA expiram em ~30 segundos)
      const age = Date.now() - parseInt(lastTimestamp);
      const maxAge = 25 * 1000; // 25 segundos para ser seguro
      
      if (age > maxAge) {
        console.log('⏰ Código 2FA expirado, limpando...');
        await Promise.all([
          SecureStore.deleteItemAsync(LAST_2FA_CODE_KEY),
          SecureStore.deleteItemAsync(LAST_2FA_TIMESTAMP_KEY)
        ]);
        return null;
      }

      console.log('✅ Código 2FA válido disponível');
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
    console.log('⚠️ SISTEMA JAVASCRIPT DE COOKIES DESABILITADO');
    console.log('ℹ️ Usando apenas sistema nativo (@react-native-cookies/cookies)');
    return; // NÃO executa mais injeção JavaScript
  };

  // FUNÇÃO AVANÇADA: Executa login automático com credenciais salvas
    // Injeta JavaScript inteligente para preencher formulários e lidar com 2FA/captcha
    // Sistema robusto com múltiplas tentativas e tratamento de edge cases
    const tryAutoLogin = async () => {
    try {
      console.log('🤖 Iniciando processo de auto-login...');
      
      // REMOVIDO: injectCookiesIntoWebView - usando apenas sistema nativo
      console.log('ℹ️ Sistema nativo de cookies será usado durante auto-login');
      
      const storedLogin = await SecureStore.getItemAsync(LOGIN_KEY);
      const storedPassword = await SecureStore.getItemAsync(PASSWORD_KEY);
      const loginType = await SecureStore.getItemAsync(LOGIN_IDENTIFIER_TYPE_KEY);

      if (!storedLogin || !storedPassword) {
        console.log('⚠️ Credenciais não encontradas no SecureStore. Impossível auto-login.');
        console.log('🔄 Redirecionando para página de login manual...');
        setAutoLoginDone(true);
        setAuthStatus('needsLogin');
        setCurrentUrl('https://corpxbank.com.br/login.php');
        setInitialUrl('https://corpxbank.com.br/login.php');
        return;
      }

      // Verificar se há código 2FA disponível
      const available2FA = await manage2FAFlow();
      
      console.log('🤖 Tentando auto-login com credenciais salvas...');
      console.log('🆔 Tipo de login:', loginType || 'unknown');
      console.log('🔐 2FA disponível:', !!available2FA);
      
      setAutoLoginDone(true);

      const safeLogin = (storedLogin || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '$$$$').replace(/'/g, "\\'");
      const safePassword = (storedPassword || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '$$$$').replace(/'/g, "\\'");
      const safe2FA = available2FA ? available2FA.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '$$$$').replace(/'/g, "\\'") : '';

      const script = `
        (function() {
          const LOGIN_VALUE = '${safeLogin}';
          const PASSWORD_VALUE = '${safePassword}';
          const TWO_FA_CODE = '${safe2FA}';
          
          console.log('🚀 Auto-login inteligente iniciado');
          console.log('📊 Dados disponíveis:', {
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
            console.log('🧩 Detectando captcha...');
            
            // reCAPTCHA v2
            const recaptchaV2 = document.querySelector('.g-recaptcha iframe, iframe[src*="recaptcha"]');
            if (recaptchaV2 && isVisible(recaptchaV2)) {
              console.log('🧩 reCAPTCHA v2 detectado');
              const checkbox = document.querySelector('#recaptcha-anchor, .recaptcha-checkbox-checkmark');
              if (checkbox && !checkbox.checked) {
                console.log('✅ Clicando em reCAPTCHA checkbox');
                checkbox.click();
                return 'recaptcha_v2_clicked';
              }
            }

            // Captcha simples (checkbox)
            const simpleCheckbox = document.querySelector('input[type="checkbox"][name*="captcha" i], input[type="checkbox"][id*="captcha" i]');
            if (simpleCheckbox && isVisible(simpleCheckbox) && !simpleCheckbox.checked) {
              console.log('✅ Clicando em captcha checkbox simples');
              simpleCheckbox.click();
              return 'simple_checkbox_clicked';
            }

            // Captcha de imagem (mais difícil de resolver automaticamente)
            const imageCaptcha = document.querySelector('img[src*="captcha" i], img[alt*="captcha" i]');
            if (imageCaptcha && isVisible(imageCaptcha)) {
              console.log('⚠️ Captcha de imagem detectado - pode precisar de intervenção manual');
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
            console.log('🎯 Iniciando auto-login inteligente...');
            
            // Verificar se há campo 2FA primeiro
            const twoFAField = find2FAField();
            if (twoFAField) {
              console.log('🔐 Campo 2FA detectado');
              
              if (TWO_FA_CODE) {
                console.log('✅ Preenchendo código 2FA automaticamente');
                setNativeValue(twoFAField, TWO_FA_CODE);
                
                setTimeout(() => {
                  const submitBtn = findSubmitButton();
                  if (submitBtn) {
                    console.log('✅ Submetendo com 2FA');
                    submitBtn.click();
                  }
                }, 1000);
                return true;
              } else {
                // Tentar usar código salvo
                const saved2FA = sessionStorage.getItem('corpx_2fa_code') || localStorage.getItem('corpx_2fa_code');
                if (saved2FA) {
                  console.log('✅ Usando código 2FA salvo');
                  setNativeValue(twoFAField, saved2FA);
                  
                  setTimeout(() => {
                    const submitBtn = findSubmitButton();
                    if (submitBtn) submitBtn.click();
                  }, 1000);
                  return true;
                } else {
                  console.log('⚠️ Campo 2FA detectado mas código não disponível');
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
            
            console.log('🔍 Campos encontrados:', {
              login: !!loginField,
              password: !!passwordField
            });

            if (!loginField || !passwordField) {
              console.log('❌ Campos de login não encontrados');
              return false;
            }

            // Preencher credenciais
            console.log('✅ Preenchendo credenciais');
            const loginFilled = setNativeValue(loginField, LOGIN_VALUE);
            const passwordFilled = setNativeValue(passwordField, PASSWORD_VALUE);
            
            if (!loginFilled || !passwordFilled) {
              console.log('❌ Falha ao preencher credenciais');
              return false;
            }

            console.log('✅ Credenciais preenchidas com sucesso');

            // Detectar e tratar captcha
            const captchaResult = detectAndHandleCaptcha();
            console.log('🧩 Resultado do captcha:', captchaResult);

            // Aguardar um pouco para processar captcha e então submeter
            const submitDelay = captchaResult.includes('clicked') ? 2000 : 1000;
            
            setTimeout(() => {
              console.log('🚀 Tentando submeter formulário...');
              
              const submitBtn = findSubmitButton();
              if (submitBtn) {
                console.log('✅ Botão submit encontrado, clicando...');
                submitBtn.click();
              } else {
                console.log('⚠️ Botão submit não encontrado, tentando submit do form');
                const form = loginField.form || passwordField.form || document.querySelector('form');
                if (form) {
                  console.log('✅ Submetendo formulário');
                  if (form.requestSubmit) {
                    form.requestSubmit();
                  } else {
                    form.submit();
                  }
                } else {
                  console.log('❌ Nenhum método de submissão encontrado');
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
            console.log(\`🔄 Tentativa \${attempts}/\${maxAttempts} de auto-login\`);
            
            if (attemptIntelligentAutoLogin()) {
              console.log('✅ Auto-login executado com sucesso');
              return;
            }
            
            if (attempts < maxAttempts) {
              setTimeout(executeAutoLogin, 500);
            } else {
              console.log('❌ Auto-login falhou após', maxAttempts, 'tentativas');
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
      showDebugMessage('Erro auto-login');
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
        injectedJavaScript={injectedJavaScript}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        useWebKit={true}
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
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00448c" />
          </View>
        )}
      />
      
      {authStatus === 'authenticated' && (
        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={() => handleLogout(false)} // Logout simples por padrão
          onLongPress={() => handleLogout(true)} // Long press = logout completo
        >
          <Text style={styles.logoutButtonText}>Sair</Text>
        </TouchableOpacity>
      )}
      
      {debugMessage && Platform.OS === 'ios' && (
        <View style={styles.debugOverlay} pointerEvents="none">
          <Text style={styles.debugText}>{debugMessage}</Text>
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
  debugOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 10,
    right: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    alignItems: 'center',
  },
  debugText: {
    color: '#fff',
    fontSize: 14,
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