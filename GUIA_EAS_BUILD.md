# Guia EAS Build - Produção CorpxBank

## Por que usar EAS Build?

### Problemas do Build Local
- ❌ **APK não abre**: Problemas de configuração nativa
- ❌ **Dependências**: Conflitos de versões Java/Android
- ❌ **Ambiente**: Configurações específicas do sistema
- ❌ **Debugging**: Difícil identificar problemas

### Vantagens do EAS Build
- ✅ **Ambiente controlado**: Servidores Expo otimizados
- ✅ **Configuração automática**: Sem conflitos de dependências
- ✅ **APK confiável**: Build de produção testado
- ✅ **Suporte nativo**: Todas as funcionalidades funcionam
- ✅ **Debugging**: Logs detalhados de build

## Configuração Atual

### EAS.json
```json
{
  "build": {
    "production": {
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleRelease"
      }
    }
  }
}
```

### App.json
- **Nome**: Corpx Bank
- **Package**: com.corpxbank.app
- **Versão**: 1.0.0
- **Permissões**: Câmera, Internet, Storage
- **Plugins**: Camera, SecureStore, Font

## Processo de Build

### 1. Preparação
```bash
# Instalar EAS CLI (se necessário)
npm install -g @expo/eas-cli

# Login na conta Expo
npx eas login
```

### 2. Configuração
```bash
# Configurar projeto para EAS
npx eas build:configure
```

### 3. Build de Produção
```bash
# Iniciar build Android
npx eas build --platform android --profile production
```

### 4. Script Automatizado
```bash
# Usar script criado
.\build_eas_production.bat
```

## Conta Expo

### Opções de Conta
1. **Conta existente**: Use a conta atual
2. **Nova conta**: Crie uma conta específica para o projeto
3. **Conta organizacional**: Para projetos empresariais

### Recomendação
- **Para teste**: Use qualquer conta Expo
- **Para produção**: Crie conta dedicada
- **Para empresa**: Use conta organizacional

## Processo Detalhado

### Tempo Estimado
- **Configuração**: 2-5 minutos
- **Build**: 10-20 minutos
- **Download**: 1-3 minutos
- **Total**: 15-30 minutos

### O que Acontece
1. **Upload**: Código enviado para servidores Expo
2. **Análise**: Dependências e configurações verificadas
3. **Build**: Compilação em ambiente controlado
4. **Otimização**: APK otimizado para produção
5. **Download**: APK disponível para download

## Comandos Úteis

### Verificar Status
```bash
# Ver builds em andamento
npx eas build:list

# Status de build específico
npx eas build:view [BUILD_ID]
```

### Gerenciar Conta
```bash
# Ver conta atual
npx eas whoami

# Fazer logout
npx eas logout

# Fazer login
npx eas login
```

### Download Manual
```bash
# Baixar APK específico
npx eas build:download [BUILD_ID]
```

## Solução de Problemas

### Build Falha
1. Verificar logs: `npx eas build:view [BUILD_ID]`
2. Corrigir erros no código
3. Tentar novamente

### Conta/Login
1. Verificar conexão internet
2. Usar `npx eas login --force`
3. Criar nova conta se necessário

### Configuração
1. Verificar app.json
2. Executar `npx eas build:configure`
3. Confirmar configurações

## Resultado Esperado

### APK de Produção
- ✅ **Funciona**: Abre corretamente no dispositivo
- ✅ **Otimizado**: Performance de produção
- ✅ **Estável**: Sem crashes ou travamentos
- ✅ **Completo**: Todas as funcionalidades ativas

### Funcionalidades Testadas
- [ ] Splash screen rápido
- [ ] Tela de login carrega
- [ ] WebView funciona
- [ ] Botão voltar ativo
- [ ] Biometria funciona
- [ ] Navegação suave
- [ ] Paleta de cores correta

## Próximos Passos

1. **Execute o script**: `build_eas_production.bat`
2. **Aguarde o build**: 10-20 minutos
3. **Baixe o APK**: Automaticamente ou manual
4. **Instale no dispositivo**: Teste completo
5. **Valide funcionalidades**: Checklist acima

---

**Vantagem Principal**: O EAS Build resolve problemas de ambiente e gera APKs confiáveis que funcionam corretamente em dispositivos Android.

**Status**: ✅ Configurado e pronto para build