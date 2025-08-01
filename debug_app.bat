@echo off
echo ========================================
echo CORPX BANK - DIAGNOSTICO DE PROBLEMAS
echo ========================================
echo.

echo [1/5] Verificando se o Metro esta rodando...
netstat -an | findstr :8081
if %errorlevel% equ 0 (
    echo ✓ Metro esta rodando na porta 8081
) else (
    echo ✗ Metro nao esta rodando
    echo Iniciando Metro...
    start "Metro" cmd /k "npx expo start --clear"
    timeout /t 10
)

echo.
echo [2/5] Verificando dispositivos conectados...
adb devices

echo.
echo [3/5] Verificando logs do dispositivo...
echo Pressione Ctrl+C para parar os logs quando necessario
echo.
adb logcat | findstr -i "corpx\|expo\|react\|error\|exception"

echo.
echo ========================================
echo DIAGNOSTICO CONCLUIDO
echo ========================================
pause