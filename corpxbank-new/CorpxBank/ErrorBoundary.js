import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Atualiza o state para mostrar a UI de erro
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log do erro
    console.error('❌ ErrorBoundary capturou um erro:', error, errorInfo);
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // Aqui você pode enviar o erro para um serviço de monitoramento
    // como Sentry, Bugsnag, etc.
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleShowDetails = () => {
    Alert.alert(
      'Detalhes do Erro',
      (this.state.error?.toString() || '') + '\n\n' + (this.state.errorInfo?.componentStack || ''),
      [{ text: 'OK' }]
    );
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Ops! Algo deu errado</Text>
            <Text style={styles.errorMessage}>
              Ocorreu um erro inesperado no aplicativo.
              Tente reiniciar ou entre em contato com o suporte.
            </Text>
            
            <View style={styles.buttonsContainer}>
              <TouchableOpacity
                style={[styles.button, styles.restartButton]}
                onPress={this.handleRestart}
              >
                <Text style={styles.buttonText}>Tentar novamente</Text>
              </TouchableOpacity>
              
              {__DEV__ && (
                <TouchableOpacity
                  style={[styles.button, styles.detailsButton]}
                  onPress={this.handleShowDetails}
                >
                  <Text style={[styles.buttonText, styles.detailsButtonText]}>
                    Ver detalhes
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0E0E',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorContainer: {
    backgroundColor: '#1A1A1A',
    padding: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333333',
    alignItems: 'center',
    maxWidth: 350,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 20,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
  },
  errorMessage: {
    color: '#CCCCCC',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 30,
  },
  buttonsContainer: {
    width: '100%',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 6,
    marginBottom: 10,
    alignItems: 'center',
  },
  restartButton: {
    backgroundColor: '#1976D2',
  },
  detailsButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666666',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  detailsButtonText: {
    color: '#CCCCCC',
  },
});

export default ErrorBoundary;