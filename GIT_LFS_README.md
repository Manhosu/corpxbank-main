# Git LFS Configuration - CorpxBank

## 📋 Resumo da Configuração

Este projeto está configurado para usar **Git Large File Storage (LFS)** para gerenciar arquivos grandes de forma eficiente.

## 🎯 Arquivos Rastreados pelo Git LFS

### Atualmente no LFS (668 KB total):
- `CorpxBank/assets/CorpxVdLogo.png` (88 KB) - Logo principal
- `CorpxBank/assets/X_icon.png` (40 KB) - Ícone do app
- `CorpxBank/assets/logo.png` (31 KB) - Logo alternativo
- `package-lock.json` (401 KB) - Dependências do projeto
- Logos do splash screen Android (5 arquivos, 108 KB total)

## ⚙️ Tipos de Arquivo Configurados

### Binários de Build:
- `*.apk`, `*.aab`, `*.ipa` - Aplicativos compilados
- `*.so`, `*.class` - Bibliotecas e classes compiladas
- `*.dll`, `*.exe` - Executáveis Windows

### Imagens:
- `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.bmp`, `*.tiff`, `*.webp`

### Certificados e Chaves:
- `*.keystore`, `*.jks`, `*.p12`, `*.p8`, `*.mobileprovision`, `*.pem`, `*.key`

### Dependências:
- `package-lock.json`, `yarn.lock`

### Arquivos de Build:
- `*.bundle`, `*.jsbundle`
- `*.zip`, `*.tar.gz`, `*.rar`, `*.7z`, `*.dmg`

### Mídia:
- `*.mp4`, `*.mov`, `*.avi`, `*.mp3`, `*.wav`, `*.flac`

## 🚀 Comandos Úteis

### Verificar arquivos no LFS:
```bash
git lfs ls-files
git lfs ls-files --size
```

### Adicionar novos tipos de arquivo:
```bash
git lfs track "*.extensao"
git add .gitattributes
git commit -m "Add new file type to LFS"
```

### Migrar arquivos existentes:
```bash
git lfs migrate import --include="*.extensao" --everything
```

### Status do LFS:
```bash
git lfs status
git lfs env
```

## ⚠️ Importante para GitHub Desktop

1. **Antes do primeiro push**: Certifique-se de que o Git LFS está instalado
2. **Arquivos grandes**: Serão automaticamente enviados para o LFS
3. **Limite do GitHub**: 100MB por arquivo, 1GB total gratuito por mês
4. **Colaboradores**: Precisam ter Git LFS instalado para clonar o repositório

## 🔧 Instalação do Git LFS

```bash
# Windows (via Git for Windows - já instalado)
git lfs version

# Inicializar no repositório
git lfs install
```

## 📊 Benefícios

- ✅ Repositório mais leve (arquivos grandes não ficam no histórico)
- ✅ Clones mais rápidos
- ✅ Melhor performance do Git
- ✅ Controle de versão eficiente para assets
- ✅ Compatível com GitHub Desktop

---

**Status**: ✅ Configurado e funcionando
**Última atualização**: $(Get-Date -Format "yyyy-MM-dd")
**Arquivos migrados**: 9 arquivos (668 KB total)