import MailStoreProvider from "./MailStoreProvider";

export default function OpenMailLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <MailStoreProvider>{children}</MailStoreProvider>;
}
