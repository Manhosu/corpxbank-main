@echo off
echo ====================================================
echo    CORPXBANK - BUILD ANDROID LOCAL
echo ====================================================
echo.

echo [1/6] Configurando JAVA_HOME...
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
echo JAVA_HOME=%JAVA_HOME%

echo [2/6] Configurando ANDROID_HOME...
set ANDROID_HOME=C:\Users\delas\AppData\Local\Android\Sdk
echo ANDROID_HOME=%ANDROID_HOME%

echo [3/6] Configurando PATH...
set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools;%PATH%

echo [4/6] Verificando Java...
"%JAVA_HOME%\bin\java.exe" -version 2>&1 | findstr /c:"version"
"%JAVA_HOME%\bin\javac.exe" -version 2>&1 | findstr /c:"javac"

echo [5/6] Navegando para pasta android...
cd android

echo [6/6] Executando build direto com gradlew...
echo.
echo Executando: gradlew.bat assembleDebug -Dorg.gradle.java.home="%JAVA_HOME%"
echo.

call gradlew.bat assembleDebug -Dorg.gradle.java.home="%JAVA_HOME%"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ====================================================
    echo    BUILD CONCLUIDO COM SUCESSO!
    echo ====================================================
    echo.
    echo APK gerado em: app\build\outputs\apk\debug\app-debug.apk
    echo.
    echo Para instalar no emulador:
    echo adb install app\build\outputs\apk\debug\app-debug.apk
) else (
    echo.
    echo ====================================================
    echo    ERRO NO BUILD!
    echo ====================================================
    echo.
    echo Possíveis soluções:
    echo 1. Abra o Android Studio e sincronize o projeto
    echo 2. Execute: gradlew clean
    echo 3. Delete a pasta .gradle e tente novamente
)

cd ..
pause 