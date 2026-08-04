
import asyncio
from analyzer.graph import build_graph
from analyzer.state import build_initial_state
import httpx
from langgraph.checkpoint.memory import InMemorySaver

async def main():
    checkpointer = InMemorySaver()
    graph = build_graph().compile(checkpointer=checkpointer)
    initial_state = build_initial_state('title', 'abstract that is quite long enough to pass', '', 'req123')
    config = {'configurable': {'thread_id': 'req123', 'checkpoint_ns': ''}}
    
    async with httpx.AsyncClient() as client:
        config['configurable']['http_client'] = client
        async for update in graph.astream(initial_state, config, stream_mode='updates'):
            print(f'UPDATE TYPE: {type(update)}')
            print(f'UPDATE VALUE: {update}')
            for node_name in update:
                print(f'  node_name: {node_name}')

asyncio.run(main())

