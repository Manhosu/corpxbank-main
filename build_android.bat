@echo off
echo Configurando JAVA_HOME para Android Studio JDK...
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set PATH=%JAVA_HOME%\bin;%PATH%

echo Configurando ANDROID_HOME para Android SDK...
set ANDROID_HOME=C:\Users\delas\AppData\Local\Android\Sdk
set PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools;%PATH%

echo Verificando configuração do Java...
"%JAVA_HOME%\bin\java.exe" -version
"%JAVA_HOME%\bin\javac.exe" -version

echo Verificando configuração do Android SDK...
echo ANDROID_HOME: %ANDROID_HOME%
dir "%ANDROID_HOME%"

echo Executando build do Android...
npx expo run:android

pause 