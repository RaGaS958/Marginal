
import httpx
import json
import asyncio
import time

async def main():
    start = time.time()
    async with httpx.AsyncClient() as client:
        async with client.stream('POST', 'http://127.0.0.1:8000/analyze', json={
            'title': 'Test Title Here',
            'abstract': 'A very very long abstract goes here so that it passes validation. It must be at least forty characters.',
            'workflow': ''
        }) as response:
            async for chunk in response.aiter_text():
                print(f'[{time.time() - start:.2f}s] Received chunk: {repr(chunk)}')

asyncio.run(main())

