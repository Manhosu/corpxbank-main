import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <StatusBar 
        barStyle="dark-content" 
        backgroundColor="#FFFFFF" 
        translucent={false}
      />

      {/* Logo principal */}
      <View style={styles.logoContainer}>
        <Image
          source={require('./assets/CorpxVdLogo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* Indicador de carregamento */}
      <View style={styles.loaderContainer}>
        <ActivityIndicator 
          size="large" 
          color="#1a472a" 
          style={styles.loader}
        />
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
    paddingTop: Platform.OS === 'ios' ? 0 : StatusBar.currentHeight || 0,
  },
  logoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logo: {
    width: Math.min(width * 0.7, 300),
    height: Math.min(height * 0.3, 200),
    maxWidth: 300,
    maxHeight: 200,
  },
  loaderContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 80 : 60,
    alignItems: 'center',
    width: '100%',
  },
  loader: {
    marginBottom: 10,
  },
  loadingText: {
    fontSize: 16,
    color: '#1a472a',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});