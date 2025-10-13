"use strict";

// next.config.js
var nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_FB_API_KEY: process.env.NEXT_PUBLIC_FB_API_KEY,
    NEXT_PUBLIC_FB_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN,
    NEXT_PUBLIC_FB_PROJECT_ID: process.env.NEXT_PUBLIC_FB_PROJECT_ID,
    NEXT_PUBLIC_FB_APP_ID: process.env.NEXT_PUBLIC_FB_APP_ID,
    NEXT_PUBLIC_FB_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET,
    NEXT_PUBLIC_FB_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FB_MESSAGING_SENDER_ID
  }
};
module.exports = nextConfig;
