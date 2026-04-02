import MailStoreProvider from "./MailStoreProvider";
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
        <MailStoreProvider>
          <OpenmailToastProvider>
            <OpenmailSecurityProvider demoMode>
              {children}
            </OpenmailSecurityProvider>
          </OpenmailToastProvider>
        </MailStoreProvider>
      </OpenmailPreferencesProvider>
    </OpenmailThemeProvider>
  );
}
