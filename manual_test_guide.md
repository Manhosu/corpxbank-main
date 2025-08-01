# Guia de Teste Manual - Funcionalidades de Exportação

## 🧪 Bateria de Testes para Exportação PDF/CSV

### Pré-requisitos
1. ✅ Servidor de desenvolvimento rodando (`npx expo start --clear`)
2. ✅ App carregado no dispositivo/emulador
3. ✅ Login realizado no sistema CorpxBank

### Testes Automáticos

#### 1. Teste de Detecção de Elementos
- ✅ O app executará automaticamente testes após 3 segundos do carregamento
- ✅ Verificará se existem botões/links de exportação na página
- ✅ Mostrará um alerta com o número de elementos encontrados

#### 2. Logs de Debug
- ✅ Verifique o console do Metro/Expo para logs detalhados:
  - `🧪 Iniciando testes automáticos de exportação...`
  - `✅ [seletor]: X elementos`
  - `📊 Total de elementos de exportação encontrados: X`

### Testes Manuais

#### 3. Teste de Exportação PDF
1. **Navegue até uma página com botão de exportação PDF**
2. **Clique no botão de exportação PDF**
3. **Verifique os logs esperados:**
   ```
   🖱️ Clique interceptado em: [elemento]
   📥 Tentando download: [URL]
   📁 Nome do arquivo: [nome].pdf
   ```
4. **Resultado esperado:**
   - Alerta de permissão (se primeira vez)
   - Download iniciado
   - Arquivo salvo na galeria/downloads

#### 4. Teste de Exportação CSV
1. **Navegue até uma página com botão de exportação CSV**
2. **Clique no botão de exportação CSV**
3. **Verifique os logs esperados:**
   ```
   🖱️ Clique interceptado em: [elemento]
   📥 Tentando download: [URL]
   📁 Nome do arquivo: [nome].csv
   ```
4. **Resultado esperado:**
   - Download iniciado
   - Arquivo salvo na galeria/downloads

#### 5. Teste de Permissões
1. **Primeira exportação deve solicitar permissão**
2. **Logs esperados:**
   ```
   📱 Verificando permissões do MediaLibrary...
   ✅ Permissões concedidas
   ```
3. **Se permissão negada:**
   ```
   ❌ Permissões negadas pelo usuário
   ```

### Cenários de Teste

#### Cenário 1: Botões Estáticos
- Botões com `onclick` que geram URLs diretas
- Links `<a>` com `href` para arquivos PDF/CSV

#### Cenário 2: Botões Dinâmicos
- Botões que geram URLs `blob:` ou `data:`
- Formulários que fazem submit para gerar downloads

#### Cenário 3: Links com `download` attribute
- Links com atributo `download` especificado
- Verificar se o nome do arquivo é preservado

### Troubleshooting

#### Problema: Nenhum elemento encontrado
**Solução:**
1. Verifique se está na página correta (com botões de exportação)
2. Aguarde o carregamento completo da página
3. Verifique se os seletores estão corretos

#### Problema: Download não inicia
**Solução:**
1. Verifique logs de interceptação
2. Confirme se as permissões foram concedidas
3. Verifique se a URL é válida

#### Problema: Arquivo não aparece na galeria
**Solução:**
1. Verifique se está rodando em app standalone (não Expo Go)
2. Confirme permissões do MediaLibrary
3. Verifique logs de salvamento

### Checklist Final

- [ ] Teste automático executado com sucesso
- [ ] Elementos de exportação detectados
- [ ] Download PDF funcional
- [ ] Download CSV funcional
- [ ] Permissões solicitadas corretamente
- [ ] Arquivos salvos na galeria/downloads
- [ ] Logs de debug detalhados
- [ ] Interceptação funcionando em diferentes tipos de botões

### Próximos Passos

Após confirmar que todos os testes passaram:
1. ✅ Executar `npx eas build --platform android --profile production`
2. ✅ Aguardar conclusão da build
3. ✅ Baixar e testar o APK final

---

**Nota:** Este guia deve ser seguido antes de gerar a build de produção para garantir que todas as funcionalidades estão operacionais.