# 📱 Instruções para Teste do Aplicativo iOS - CorpX Bank

## 🎯 Perfil de Desenvolvimento Criado

Foi criado um perfil específico chamado **`ios-client-test`** no arquivo `eas.json` para facilitar os testes do aplicativo iOS.

## 🚀 Como Gerar a Build para Testes

### Pré-requisitos
1. Ter o Node.js instalado
2. Ter o EAS CLI instalado globalmente: `npm install -g @expo/eas-cli`
3. Estar logado na conta EAS: `npx eas login`

### Comando para Gerar a Build
```bash
npx eas build --platform ios --profile ios-client-test
```

## 📋 Características do Perfil `ios-client-test`

### ✅ Configurações Otimizadas
- **Distribuição**: Interna (ideal para testes)
- **Simulator**: Desabilitado (build para dispositivos físicos)
- **Credenciais**: Remotas (gerenciadas pelo EAS)
- **Auto Increment**: Habilitado (versão automática)
- **Bundle ID**: `com.corpxfinal.corpxbank`

### ⚙️ Variáveis de Ambiente
- `NODE_ENV`: production
- `EXPO_USE_HERMES`: 0 (JavaScript Core)
- `EXPO_USE_NEW_ARCHITECTURE`: 0 (arquitetura clássica)
- `REACT_NATIVE_HERMES`: false
- `HERMES_ENABLED`: false

## 📱 Como Instalar no Dispositivo iOS

### Opção 1: TestFlight (Recomendado)
1. Após a build ser concluída, você receberá um link
2. Faça upload para o TestFlight via App Store Connect
3. Convide os testadores via TestFlight
4. Os testadores instalam via app TestFlight

### Opção 2: Instalação Direta (Ad Hoc)
1. Após a build, baixe o arquivo `.ipa`
2. Use ferramentas como:
   - **Xcode**: Devices and Simulators
   - **3uTools**: Ferramenta de terceiros
   - **Apple Configurator 2**: Ferramenta oficial da Apple

## 🔧 Comandos Úteis

### Verificar Status da Build
```bash
npx eas build:list --platform ios
```

### Baixar a Build
```bash
npx eas build:download [BUILD_ID]
```

### Ver Logs da Build
```bash
npx eas build:view [BUILD_ID]
```

## 📝 Informações Importantes

### 🎯 Para o Cliente/Testador
1. **Dispositivos Compatíveis**: iPhone/iPad com iOS 13.4+
2. **Instalação**: Requer dispositivo registrado no perfil de desenvolvimento
3. **Duração**: Builds de desenvolvimento expiram em 7 dias
4. **Limite**: Máximo 100 dispositivos por ano no programa de desenvolvimento

### 🔒 Segurança
- As credenciais são gerenciadas remotamente pelo EAS
- O certificado de desenvolvimento é válido por 1 ano
- O perfil de provisionamento é atualizado automaticamente

## 🆘 Solução de Problemas

### Build Falha
1. Verificar se as credenciais iOS estão configuradas
2. Verificar se o Bundle ID está correto
3. Consultar logs detalhados da build

### Instalação Falha
1. Verificar se o dispositivo está registrado
2. Verificar se o perfil de provisionamento inclui o dispositivo
3. Verificar se a data/hora do dispositivo está correta

### App Não Abre
1. Verificar compatibilidade do iOS
2. Verificar se há conflitos com outras versões do app
3. Tentar reiniciar o dispositivo

## 📞 Suporte

Em caso de problemas:
1. Verificar os logs da build no link fornecido
2. Consultar a documentação do Expo: https://docs.expo.dev/
3. Entrar em contato com a equipe de desenvolvimento

---

**Nota**: Este perfil foi criado especificamente para testes e não deve ser usado para distribuição na App Store. Para produção, use o perfil `production`.