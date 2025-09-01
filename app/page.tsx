"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function Splash() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/onboarding");
    }, 2000); // 2 seconds splash then onboarding
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-ivory">
      <Image
        src="/logo-trimzi.svg"
        alt="TrimZi Logo"
        width={80}
        height={80}
        className="mb-2"
      />
      <h1 className="text-2xl font-bold text-brown">TrimZi</h1>
    </div>
  );
}
