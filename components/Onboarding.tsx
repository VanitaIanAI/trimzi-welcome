gimport React from 'react';

export default function Onboarding({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-amber-100 text-center p-6">
      <h1 className="text-4xl font-bold text-brown mb-4">Welcome to TrimZi</h1>
      <p className="text-lg text-brown mb-8">
        Premium grooming for men. Book services instantly, anytime, anywhere.
      </p>
      <div className="flex gap-4">
        <button 
          className="px-6 py-2 rounded bg-brown text-white font-semibold hover:bg-brown-dark"
          onClick={onFinish}
        >
          Get Started
        </button>
        <button 
          className="px-6 py-2 rounded border border-brown text-brown font-semibold hover:bg-brown-light"
          onClick={onFinish}
        >
          Sign In
        </button>
      </div>
    </div>
  );
}
