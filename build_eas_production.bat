@echo off
echo ========================================
echo BUILD EAS PRODUCTION - CORPX BANK
echo ========================================
echo.

echo [1/5] Verificando instalacao do EAS CLI...
npx eas --version
if %errorlevel% neq 0 (
    echo Instalando EAS CLI...
    npm install -g @expo/eas-cli
)
echo.

echo [2/5] Status do login atual...
npx eas whoami
echo.
echo IMPORTANTE: Se nao estiver logado ou quiser usar outra conta:
echo Execute: npx eas login
echo.

echo [3/5] Verificando configuracao do projeto...
npx eas build:configure
echo.

echo [4/5] Iniciando build de producao Android...
echo Este processo pode levar 10-20 minutos...
npx eas build --platform android --profile production
echo.

echo [5/5] Build concluido!
echo O APK de producao sera baixado automaticamente.
echo Verifique a pasta de downloads ou use:
echo npx eas build:list
echo.

echo ========================================
echo PROXIMOS PASSOS:
echo 1. Instale o APK no dispositivo
echo 2. Teste todas as funcionalidades
echo 3. O APK de producao deve funcionar corretamente
echo ========================================
pause