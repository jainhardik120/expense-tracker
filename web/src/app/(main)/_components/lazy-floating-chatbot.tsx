'use client';

import dynamic from 'next/dynamic';

/**
 * The assistant, fetched only where it is rendered.
 *
 * Imported directly, its markdown renderer, HTML parser and AI SDK -- about
 * 400 KB -- were part of every page's JavaScript even with the feature off.
 * The split has to happen in a client component: a dynamic import in the
 * server layout still had Next ship the code with every route.
 */
const FloatingChatbot = dynamic(() => import('./floating-chatbot'));

export default function LazyFloatingChatbot() {
  return <FloatingChatbot />;
}
