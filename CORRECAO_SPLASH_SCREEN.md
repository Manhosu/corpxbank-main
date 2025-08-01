# Correção do Splash Screen - CorpxBank

## Problema Identificado
O aplicativo estava travando na tela de splash screen (tela preta com logo) devido a:

1. **Arquivo de logo ausente**: O arquivo `splashscreen_logo` referenciado em `styles.xml` não existia
2. **Configuração incorreta**: A linha `setTheme(R.style.AppTheme)` estava comentada no `MainActivity.kt`
3. **Parâmetro incorreto**: `super.onCreate(null)` em vez de `super.onCreate(savedInstanceState)`

## Correções Aplicadas

### 1. Criação do Logo do Splash Screen
- **Arquivo**: `android/app/src/main/res/drawable/splashscreen_logo.xml`
- **Conteúdo**: Logo vetorial com círculos concêntricos e grade
- **Resultado**: Resolve a referência ausente no tema

### 2. Correção do MainActivity.kt
- **Descomentada**: `setTheme(R.style.AppTheme)`
- **Corrigida**: `super.onCreate(savedInstanceState)`
- **Resultado**: Transição correta do splash para o app

### 3. Atualização do Bundle
- **Comando**: `npx expo export --platform android --clear`
- **Resultado**: Bundle atualizado com as correções JavaScript

## APK Corrigido

📱 **Arquivo**: `CorpxBank-SPLASH-CORRIGIDO.apk`

### Como Instalar
1. Transfira o APK para seu dispositivo Android
2. Ative "Fontes desconhecidas" nas configurações
3. Instale o APK
4. Teste a abertura do aplicativo

### O que Esperar
✅ **Antes**: Tela preta travada com logo
✅ **Depois**: Splash screen rápido → Tela de login

## Funcionalidades a Testar

### Splash Screen
- [ ] Abertura rápida (1-2 segundos)
- [ ] Logo aparece corretamente
- [ ] Transição suave para tela de login

### Funcionalidades Principais
- [ ] Tela de login carrega
- [ ] Botão "Voltar" funciona na WebView
- [ ] Biometria é solicitada automaticamente
- [ ] Paleta de cores atualizada
- [ ] Botão de cadastro oculto

## Arquivos Modificados

1. `android/app/src/main/res/drawable/splashscreen_logo.xml` (criado)
2. `android/app/src/main/kotlin/com/corpxbank/MainActivity.kt` (corrigido)
3. `dist/` (bundle atualizado)

## Próximos Passos

1. **Teste o APK corrigido** no dispositivo onde ocorria o travamento
2. **Verifique** se o splash screen funciona corretamente
3. **Confirme** que todas as funcionalidades estão operacionais
4. **Reporte** qualquer problema adicional encontrado

---

**Status**: ✅ Correções aplicadas e APK gerado
**Data**: $(Get-Date -Format 'dd/MM/yyyy HH:mm')
**Versão**: CorpxBank-SPLASH-CORRIGIDO.apk