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

  return (
    <ErrorBoundary>
      <NavigationContainer>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <Stack.Navigator
          initialRouteName="WebView" // Navega direto para a WebView
          screenOptions={{
            headerShown: false,
            gestureEnabled: false,
            animationEnabled: false, // Desabilitar animação para uma transição mais limpa
          }}
        >
          {/* A tela Splash não é mais necessária aqui no navegador */}
          <Stack.Screen 
            name="WebView" 
            component={CorpxWebViewScreen}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}

// Estilos removidos - usando apenas SplashScreen component