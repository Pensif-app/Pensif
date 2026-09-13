import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mockSttProvider } from './mock.ts';

Deno.test('mockSttProvider décode les octets en texte tel quel (aucun réseau)', async () => {
  const text = await mockSttProvider.transcribe(
    { bytes: new TextEncoder().encode('Micka aime le café'), mimeType: 'text/plain', filename: 'test.txt' },
    { model: 'unused' },
  );
  assertEquals(text, 'Micka aime le café');
});
