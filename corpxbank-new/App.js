import React, { useState, useEffect } from 'react';
import { StatusBar, StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import SplashScreen from './CorpxBank/SplashScreen';

import CorpxWebViewScreen from './CorpxBank/CorpxWebViewScreen';
import ErrorBoundary from './CorpxBank/ErrorBoundary';

const SESSION_KEY = 'corpxbank_session';
const LOGIN_STATUS_KEY = 'corpxbank_logged';

const Stack = createStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuthenticationStatus();
  }, []);



  const checkAuthenticationStatus = async () => {
    try {
      console.log('🔍 Verificando status de autenticação...');

      // Delay de 2 segundos para exibir a splash screen
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Primeiro, verificar se já existe uma sessão válida
      const savedSession = await SecureStore.getItemAsync(SESSION_KEY);
      const loginStatus = await SecureStore.getItemAsync(LOGIN_STATUS_KEY);

      console.log('📊 Status encontrado:', { 
        hasSession: !!savedSession, 
        loginStatus: loginStatus 
      });

      // Se já tem sessão válida, ir direto para WebView
      if (savedSession && loginStatus === 'true') {
        try {
          const sessionData = JSON.parse(savedSession);
          const sessionAge = Date.now() - sessionData.timestamp;
          const maxAge = 24 * 60 * 60 * 1000; // 24 horas

          if (sessionAge < maxAge) {
            console.log('✅ Sessão válida encontrada - redirecionando para WebView');
            setInitialRoute('WebView');
            setIsLoading(false);
            return;
          } else {
            console.log('⏰ Sessão expirada - limpando dados...');
            await Promise.all([
              SecureStore.deleteItemAsync(SESSION_KEY),
              SecureStore.deleteItemAsync(LOGIN_STATUS_KEY)
            ]);
          }
        } catch (error) {
          console.error('❌ Erro ao validar sessão:', error);
        }
      }

      // Verificar se há suporte a biometria e dados salvos
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const savedLogin = await SecureStore.getItemAsync('login');
      const savedPassword = await SecureStore.getItemAsync('senha');
      const biometricActive = await SecureStore.getItemAsync('biometriaAtiva');

      console.log('🔒 Verificando biometria:', {
        compatible,
        enrolled,
        hasLogin: !!savedLogin,
        hasPassword: !!savedPassword,
        biometricActive
      });

      // Se tem biometria disponível e configurada
      if (compatible && enrolled && biometricActive === 'true' && savedLogin && savedPassword) {
        console.log('🔒 Solicitando autenticação biométrica...');
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Use sua biometria para acessar o Corpx Bank',
          cancelLabel: 'Cancelar',
          fallbackLabel: 'Usar senha',
        });

        if (result.success) {
          console.log('✅ Biometria autenticada com sucesso');
          
          // Criar sessão imediatamente
          const sessionData = {
            timestamp: Date.now(),
            login: savedLogin,
            viaBiometric: true
          };
          
          await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(sessionData));
          await SecureStore.setItemAsync(LOGIN_STATUS_KEY, 'true');
          
          setInitialRoute('WebView');
          setIsLoading(false);
          return;
        } else {
          console.log('❌ Biometria falhou ou foi cancelada');
        }
      }

      // Caso contrário, ir para tela de login via webview
      console.log('🔑 Redirecionando para login via webview');
      setInitialRoute('Splash');

    } catch (error) {
      console.error('❌ Erro ao verificar autenticação:', error);
      setInitialRoute('Splash');
    } finally {
      setIsLoading(false);
    }
  };

  // Renderizar tela de loading inicial
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <ActivityIndicator size="large" color="#000000" />
        <Text style={styles.loadingText}>Inicializando Corpx...</Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <NavigationContainer>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false, // Ocultar header de navegação
            gestureEnabled: false, // Desabilitar gestos de voltar
            animationEnabled: true, // Manter animações
          }}
        >
          <Stack.Screen 
            name="Splash" 
            component={SplashScreen}
            options={{
              animationTypeForReplace: 'push',
            }}
          />

          <Stack.Screen 
            name="WebView" 
            component={CorpxWebViewScreen}
            options={{
              animationTypeForReplace: 'push',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#333333',
    fontSize: 16,
    marginTop: 20,
    textAlign: 'center',
  },
});