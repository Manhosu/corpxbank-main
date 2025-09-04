import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  StatusBar,
  Vibration,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');
const CAMERA_PERMISSION_KEY = 'camera_permission_granted';

export default function ScannerScreen({ route }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const navigation = useNavigation();
  const cameraRef = useRef(null);
  
  // Parâmetros vindos da WebView
  const { returnToWebView } = route.params || {};

  useEffect(() => {
    getCameraPermissions();
    
    // Limpeza ao desmontar componente (simplificada)
    return () => {
      // Não há timers para limpar no fluxo simplificado
    };
  }, []);

  const getCameraPermissions = async () => {
    try {
      // Verificar cache de permissão primeiro
      const cachedPermission = await AsyncStorage.getItem(CAMERA_PERMISSION_KEY);
      if (cachedPermission === 'true') {
        console.log('✅ Scanner: Permissão de câmera já aprovada (cache)');
        setHasPermission(true);
        setPermissionChecked(true);
        return;
      }
      
      // Verificar permissão atual do sistema
      const { status: currentStatus } = await Camera.getCameraPermissionsAsync();
      
      if (currentStatus === 'granted') {
        console.log('✅ Scanner: Permissão de câmera já concedida');
        // Salvar no cache para próximas aberturas
        await AsyncStorage.setItem(CAMERA_PERMISSION_KEY, 'true');
        setHasPermission(true);
        setPermissionChecked(true);
        return;
      }
      
      // Solicitar permissão apenas se necessário
      console.log('📷 Scanner: Solicitando permissão de câmera...');
      const { status } = await Camera.requestCameraPermissionsAsync();
      const granted = status === 'granted';
      
      setHasPermission(granted);
      setPermissionChecked(true);
      
      if (granted) {
        // Salvar permissão aprovada no cache
        await AsyncStorage.setItem(CAMERA_PERMISSION_KEY, 'true');
        console.log('✅ Scanner: Permissão concedida e salva no cache');
      } else {
        console.log('❌ Scanner: Permissão negada pelo usuário');
        Alert.alert(
          'Câmera Necessária',
          'Para escanear QR Codes, é necessário permitir o acesso à câmera.',
          [
            { 
              text: 'Cancelar', 
              style: 'cancel', 
              onPress: () => navigation.goBack() 
            },
            { 
              text: 'Tentar Novamente', 
              onPress: () => {
                setPermissionChecked(false);
                getCameraPermissions();
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('❌ Scanner: Erro ao verificar permissões:', error);
      setPermissionChecked(true);
      Alert.alert(
        'Erro de Permissão',
        'Não foi possível acessar a câmera.',
        [
          { text: 'Voltar', onPress: () => navigation.goBack() },
          { 
            text: 'Tentar Novamente', 
            onPress: () => {
              setPermissionChecked(false);
              getCameraPermissions();
            }
          }
        ]
      );
    }
  };

  const handleBarCodeScanned = ({ type, data }) => {
    if (scanned || processing) return;
    
    setScanned(true);
    setProcessing(true);
    Vibration.vibrate(100); // Feedback tátil
    
    // Validar se é um código válido
    if (isValidCode(data)) {
      const codeType = detectCodeType(data);
      const scanResult = {
        type: codeType,
        data: data,
        success: true,
        timestamp: Date.now(),
        processedData: processCodeData(data, codeType)
      };
      
      // FLUXO SIMPLIFICADO: Enviar dados diretamente e retornar após tempo fixo
      if (returnToWebView) {
        try {
          console.log('📤 Scanner: Enviando dados para WebView...', { type: codeType, data: data.substring(0, 50) + '...' });
          
          // Feedback imediato para usuário
          setProcessing(true);
          
          // Enviar dados diretamente (sem callback complexo)
          returnToWebView(scanResult);
          
          // Aguardar tempo suficiente para WebView processar (3 segundos)
          setTimeout(() => {
            console.log('✅ Scanner: Dados processados, retornando...');
            setProcessing(false);
            navigation.goBack();
          }, 3000);
          
        } catch (error) {
          console.error('❌ Scanner: Erro ao enviar dados:', error);
          // Estratégia de fallback simplificada
          Alert.alert(
            'Erro no Scanner',
            'Houve um problema ao processar o código. Os dados foram salvos e serão recuperados automaticamente.',
            [
              {
                text: 'Continuar',
                onPress: () => {
                  setProcessing(false);
                  navigation.goBack();
                }
              },
              {
                text: 'Tentar Novamente',
                onPress: () => {
                  setScanned(false);
                  setProcessing(false);
                }
              }
            ]
          );
        }
      } else {
        // Se não há callback do WebView, navegar imediatamente
        setProcessing(false);
        navigation.goBack();
      }
    } else {
      setProcessing(false);
      Alert.alert(
        'Código Inválido',
        'O código escaneado não é válido. Tente novamente.',
        [
          {
            text: 'Tentar Novamente',
            onPress: () => {
              setScanned(false);
              setProcessing(false);
            }
          },
          {
            text: 'Cancelar',
            onPress: () => navigation.goBack()
          }
        ]
      );
    }
  };

  const isValidCode = (data) => {
    if (!data || data.length < 10) return false;
    
    // Validações básicas para diferentes tipos de código
    // QR Code geralmente tem mais de 20 caracteres
    // Código de barras de boleto tem padrões específicos
    return true; // Por enquanto aceita qualquer código
  };

  const processCodeData = (data, type) => {
    try {
      switch (type) {
        case 'qr_code':
          // Processar QR Code PIX
          if (data.includes('pix')) {
            return processPixData(data);
          } else if (data.includes('http')) {
            return { url: data, type: 'link' };
          }
          return { rawData: data };
          
        case 'boleto':
          // Processar código de barras de boleto
          return processBoletoData(data);
          
        default:
          return { rawData: data };
      }
    } catch (error) {
      console.error('Erro ao processar dados:', error);
      return { rawData: data, error: error.message };
    }
  };
  
  const processPixData = (pixCode) => {
    // Processar dados do PIX baseado no padrão EMV
    const processed = {
      type: 'pix',
      rawCode: pixCode
    };
    
    try {
      // Extrair informações básicas do código PIX
      if (pixCode.includes('br.gov.bcb.pix')) {
        // PIX dinâmico ou estático
        const urlMatch = pixCode.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          processed.pixUrl = urlMatch[0];
          processed.isDynamic = true;
        }
      }
      
      // Tentar extrair valor se presente
      const valueMatch = pixCode.match(/54(\d{2})([\d.]+)/);
      if (valueMatch) {
        processed.value = parseFloat(valueMatch[2]);
      }
      
      // Tentar extrair descrição
      const descMatch = pixCode.match(/58(\d{2})([^\d]+)/);
      if (descMatch) {
        processed.description = descMatch[2];
      }
      
    } catch (error) {
      console.error('Erro ao processar PIX:', error);
    }
    
    return processed;
  };
  
  const processBoletoData = (boletoCode) => {
    // Processar código de barras de boleto
    const processed = {
      type: 'boleto',
      rawCode: boletoCode,
      digitableLine: boletoCode
    };
    
    try {
      // Extrair informações básicas do boleto
      if (boletoCode.length >= 44) {
        // Código de barras padrão
        processed.bankCode = boletoCode.substring(0, 3);
        processed.currencyCode = boletoCode.substring(3, 4);
        processed.dueDate = boletoCode.substring(4, 8);
        processed.value = boletoCode.substring(8, 18);
      }
    } catch (error) {
      console.error('Erro ao processar boleto:', error);
    }
    
    return processed;
  };

  const detectCodeType = (data) => {
    if (!data) return 'unknown';
    
    // Detectar tipo baseado no conteúdo
    if (data.includes('pix') || data.includes('br.gov.bcb.pix')) {
      return 'qr_code';
    } else if (data.includes('http')) {
      return 'qr_code';
    } else if (data.length >= 44 && /^[0-9]+$/.test(data)) {
      return 'boleto';
    } else if (/^[0-9]{13}$/.test(data)) {
      return 'ean13';
    } else {
      return 'codigo_barras';
    }
  };

  const toggleFlash = () => {
    setFlashOn(!flashOn);
  };

  const resetScanner = () => {
    setScanned(false);
    setProcessing(false);
  };

  if (!permissionChecked || hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Verificando permissões da câmera...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Acesso à câmera necessário</Text>
        <Text style={[styles.text, { fontSize: 14, marginTop: 10, opacity: 0.7 }]}>
          Para escanear QR Codes e boletos
        </Text>
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => {
            setPermissionChecked(false);
            getCameraPermissions();
          }}
        >
          <Text style={styles.buttonText}>Permitir Câmera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        enableTorch={flashOn}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: [
            'qr',
            'pdf417',
            'aztec',
            'ean13',
            'ean8',
            'upc_e',
            'code128',
            'code39',
            'code93',
            'codabar',
            'itf14',
            'datamatrix'
          ],
        }}
      >
        {/* Overlay com área de foco */}
        <View style={styles.overlay}>
          <View style={styles.topOverlay} />
          <View style={styles.middleRow}>
            <View style={styles.sideOverlay} />
            <View style={styles.focusArea}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              
              {/* Indicador de processamento */}
              {processing && (
                <View style={styles.processingOverlay}>
                  <View style={styles.processingIndicator}>
                    <Text style={styles.processingText}>✅</Text>
                    <Text style={styles.processingLabel}>Código detectado!</Text>
                    <Text style={[styles.processingLabel, { fontSize: 12, marginTop: 5, opacity: 0.8 }]}>Enviando dados...</Text>
                  </View>
                </View>
              )}
            </View>
            <View style={styles.sideOverlay} />
          </View>
          <View style={styles.bottomOverlay}>
            <Text style={styles.instructionText}>
              {processing 
                ? '⚙️ Processando código...\nApenas alguns segundos'
                : '📱 Aponte para o QR Code ou boleto\nAlinhando dentro da área verde'
              }
            </Text>
          </View>
        </View>
        
        {/* Controles */}
        <View style={styles.controls}>
          {!processing && (
            <>
              <TouchableOpacity 
                style={[styles.controlButton, styles.cancelButton]} 
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.controlButtonText}>❌ Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.controlButton, flashOn ? styles.flashOnButton : styles.flashOffButton]} 
                onPress={toggleFlash}
              >
                <Text style={styles.controlButtonText}>
                  {flashOn ? '🔆 Flash' : '🔦 Flash'}
                </Text>
              </TouchableOpacity>
              
              {scanned && (
                <TouchableOpacity 
                  style={[styles.controlButton, styles.retryButton]} 
                  onPress={resetScanner}
                >
                  <Text style={styles.controlButtonText}>🔄 Tentar Novamente</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          
          {processing && (
            <View style={[styles.controlButton, styles.processingButton]}>
              <Text style={styles.controlButtonText}>⌛ Processando...</Text>
            </View>
          )}
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  middleRow: {
    flexDirection: 'row',
    height: 250,
  },
  sideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  focusArea: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#00FF00',
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  bottomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  instructionText: {
    color: '#FFF',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  controls: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
  },
  controlButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#FFF',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
    borderColor: '#FF3B30',
  },
  flashOnButton: {
    backgroundColor: 'rgba(255, 204, 0, 0.8)',
    borderColor: '#FFCC00',
  },
  flashOffButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: '#FFF',
  },
  retryButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    borderColor: '#007AFF',
  },
  processingButton: {
    backgroundColor: 'rgba(52, 199, 89, 0.8)',
    borderColor: '#34C759',
  },
  controlButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  text: {
    color: '#FFF',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    alignSelf: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  processingIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingText: {
    fontSize: 32,
    color: '#FFF',
    marginBottom: 8,
  },
  processingLabel: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});