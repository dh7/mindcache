import { SignInButton, SignedIn, SignedOut, UserButton } from '@clerk/nextjs';

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <nav className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">MindCache</h1>
        <div>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition">
                Sign In
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </nav>

      <SignedOut>
        <div className="max-w-2xl mx-auto text-center py-20">
          <h2 className="text-4xl font-bold mb-4">
            Collaborative Key-Value Store for AI Agents
          </h2>
          <p className="text-gray-400 mb-8">
            Real-time sync, automatic LLM tools, and seamless collaboration.
          </p>
          <SignInButton mode="modal">
            <button className="px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-gray-200 transition">
              Get Started
            </button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold mb-4">Your Projects</h2>
          <div className="border border-gray-800 rounded-lg p-8 text-center text-gray-500">
            <p>No projects yet. Create your first project to get started.</p>
            <button className="mt-4 px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition">
              Create Project
            </button>
          </div>
        </div>
      </SignedIn>
    </main>
  );
}

