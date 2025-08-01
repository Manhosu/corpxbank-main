@echo off
echo ========================================
echo GERANDO APK CORRIGIDO - SPLASH SCREEN
echo ========================================
echo.

echo [1/4] Configurando variaveis de ambiente...
set JAVA_HOME=C:\Program Files\Java\jdk-17
set ANDROID_HOME=C:\Users\%USERNAME%\AppData\Local\Android\Sdk
set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools;%PATH%

echo JAVA_HOME: %JAVA_HOME%
echo ANDROID_HOME: %ANDROID_HOME%
echo.

echo [2/4] Verificando configuracoes...
java -version
echo.

echo [3/4] Limpando cache e gerando APK...
npx expo install --fix
npx expo export --platform android --clear

echo.
echo [4/4] Compilando APK nativo...
cd android
.\gradlew.bat clean
.\gradlew.bat assembleDebug
cd ..

echo.
if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    echo ✅ APK gerado com sucesso!
    copy "android\app\build\outputs\apk\debug\app-debug.apk" "CorpxBank-CORRIGIDO.apk"
    echo 📱 APK salvo como: CorpxBank-CORRIGIDO.apk
    echo.
    echo 🔧 CORREÇÕES APLICADAS:
    echo - ✅ Splash screen logo criado
    echo - ✅ MainActivity.kt corrigido
    echo - ✅ Tema do splash screen configurado
    echo.
    echo 📋 PRÓXIMOS PASSOS:
    echo 1. Desinstale o APK anterior do celular
    echo 2. Instale o novo APK: CorpxBank-CORRIGIDO.apk
    echo 3. Teste a inicialização do app
) else (
    echo ❌ Erro ao gerar APK
    echo Verifique os logs acima para mais detalhes
)

echo.
echo ========================================
echo PROCESSO CONCLUIDO
echo ========================================
pause