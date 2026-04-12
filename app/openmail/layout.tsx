import { GuardianInterceptProvider } from "./GuardianInterceptProvider";
import { GuardianTraceProvider } from "./GuardianTraceProvider";
import MailStoreProvider from "./MailStoreProvider";
import { SmartNotificationsProvider } from "./SmartNotificationsProvider";
import { AttentionEngineProvider } from "./AttentionEngineProvider";
import { UserBehaviorProvider } from "./UserBehaviorProvider";
import { OpenmailPreferencesProvider } from "./OpenmailPreferencesProvider";
import { OpenmailSecurityProvider } from "./OpenmailSecurityProvider";
import { OpenmailThemeProvider } from "./OpenmailThemeProvider";
import { OpenmailToastProvider } from "./OpenmailToastProvider";

export default function OpenMailLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <OpenmailThemeProvider>
      <OpenmailPreferencesProvider>
        <UserBehaviorProvider>
          <GuardianTraceProvider>
            <GuardianInterceptProvider>
              <MailStoreProvider>
                <SmartNotificationsProvider>
                  <AttentionEngineProvider>
                    <OpenmailToastProvider>
                      <OpenmailSecurityProvider demoMode>
                        {children}
                      </OpenmailSecurityProvider>
                    </OpenmailToastProvider>
                  </AttentionEngineProvider>
                </SmartNotificationsProvider>
              </MailStoreProvider>
            </GuardianInterceptProvider>
          </GuardianTraceProvider>
        </UserBehaviorProvider>
      </OpenmailPreferencesProvider>
    </OpenmailThemeProvider>
  );
}
