'use client';

import dynamic from 'next/dynamic';

const FloatingChatbot = dynamic(() => import('./floating-chatbot'));

export default function LazyFloatingChatbot() {
  return <FloatingChatbot />;
}
