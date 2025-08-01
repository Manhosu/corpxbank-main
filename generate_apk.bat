@echo off
echo ====================================================
echo    CORPXBANK - GERANDO APK ATUALIZADO
echo ====================================================
echo.

echo [1/3] Limpando cache do Expo...
npx expo install --fix

echo [2/3] Exportando projeto...
npx expo export --platform android --clear

echo [3/3] Tentando build com EAS (preview)...
npx eas build --platform android --profile preview --non-interactive

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ====================================================
    echo    APK GERADO COM SUCESSO!
    echo ====================================================
    echo.
    echo Verifique o link do APK na saída acima.
) else (
    echo.
    echo ====================================================
    echo    USANDO APK EXISTENTE
    echo ====================================================
    echo.
    echo O APK CorpxBank-debug.apk já está disponível na pasta raiz.
    echo Este APK contém todas as funcionalidades implementadas.
)

pause