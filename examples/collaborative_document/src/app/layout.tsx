import './globals.css';

export const metadata = {
    title: 'Collaborative Document Demo | MindCache',
    description: 'Real-time collaborative editing with MindCache document type',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="bg-gray-900 text-white min-h-screen">{children}</body>
        </html>
    );
}
