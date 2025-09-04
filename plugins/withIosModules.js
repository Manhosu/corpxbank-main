const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withIosModules(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

      // Adicionar use_modular_headers! se não existir
      if (!podfileContent.includes('use_modular_headers!')) {
        const targetName = config.modRequest.projectName;
        const targetRegex = new RegExp(`target '${targetName}' do`);

        const replacement = `use_modular_headers!\n\ntarget '${targetName}' do`;

        if (podfileContent.match(targetRegex)) {
            podfileContent = podfileContent.replace(
              targetRegex,
              replacement
            );
        } else {
            const platformRegex = /platform :ios, '.*'/;
             podfileContent = podfileContent.replace(
              platformRegex,
              `$&\nuse_modular_headers!`
            );
        }

        fs.writeFileSync(podfilePath, podfileContent);
      }

      // Configurar WKUIDelegate para auto-grant de permissões de câmera
      const appDelegatePath = path.join(config.modRequest.platformProjectRoot, 'CorpxBank', 'AppDelegate.mm');
      
      // Tentar localizar AppDelegate em diferentes extensões
      let appDelegateFile = null;
      const possiblePaths = [
        path.join(config.modRequest.platformProjectRoot, 'CorpxBank', 'AppDelegate.mm'),
        path.join(config.modRequest.platformProjectRoot, 'CorpxBank', 'AppDelegate.m'),
        path.join(config.modRequest.platformProjectRoot, 'AppDelegate.mm'),
        path.join(config.modRequest.platformProjectRoot, 'AppDelegate.m')
      ];

      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          appDelegateFile = possiblePath;
          break;
        }
      }

      if (appDelegateFile && fs.existsSync(appDelegateFile)) {
        let appDelegateContent = fs.readFileSync(appDelegateFile, 'utf-8');
        
        // Verificar se a configuração já foi adicionada
        if (!appDelegateContent.includes('requestMediaCapturePermissionFor')) {
          // Adicionar imports necessários
          if (!appDelegateContent.includes('@import WebKit;')) {
            appDelegateContent = appDelegateContent.replace(
              '#import "AppDelegate.h"',
              '#import "AppDelegate.h"\n@import WebKit;'
            );
          }
          
          // Adicionar extensão WKUIDelegate se não existir
          if (!appDelegateContent.includes('WKUIDelegate')) {
            appDelegateContent = appDelegateContent.replace(
              '@interface AppDelegate',
              '@interface AppDelegate () <WKUIDelegate>'
            );
          }
          
          // Adicionar método para auto-grant de permissões
          const permissionMethod = `
// MARK: - WebView Camera Permission Auto-Grant
// Automatically grant camera permissions to trusted domains to avoid double prompts
- (void)webView:(WKWebView *)webView requestMediaCapturePermissionForOrigin:(WKSecurityOrigin *)origin initiatedByFrame:(WKFrameInfo *)frame type:(WKMediaCaptureType)type decisionHandler:(void (^)(WKPermissionDecision))decisionHandler API_AVAILABLE(ios(15.0)) {
  NSLog(@"🔐 WebView: Auto-granting %@ permission for origin: %@", 
        (type == WKMediaCaptureTypeCamera) ? @"camera" : @"microphone", 
        origin.host);
  
  // Auto-grant for trusted domains (CorpxBank)
  if ([origin.host isEqualToString:@"app.corpxbank.com.br"]) {
    NSLog(@"✅ WebView: Permission auto-granted for trusted domain");
    decisionHandler(WKPermissionDecisionGrant);
  } else {
    NSLog(@"⚠️ WebView: Permission prompt for untrusted domain");
    decisionHandler(WKPermissionDecisionPrompt);
  }
}

// Fallback for iOS 14 and below
- (void)webView:(WKWebView *)webView runJavaScriptTextInputPanelWithPrompt:(NSString *)prompt defaultText:(NSString *)defaultText initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(NSString *))completionHandler {
  NSLog(@"🔐 WebView: JavaScript input prompt: %@", prompt);
  completionHandler(defaultText);
}
`;
          
          // Adicionar o método antes do último @end
          const lastEndIndex = appDelegateContent.lastIndexOf('@end');
          if (lastEndIndex !== -1) {
            appDelegateContent = appDelegateContent.slice(0, lastEndIndex) + 
                               permissionMethod + 
                               '\n' + appDelegateContent.slice(lastEndIndex);
            
            fs.writeFileSync(appDelegateFile, appDelegateContent);
            console.log('✅ iOS WebView auto-grant permission configuration added');
          }
        }
      }

      return config;
    },
  ]);
};