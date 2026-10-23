import asyncio
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

URL = "http://localhost:8931/mcp"

async def main():
    async with streamable_http_client(URL) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            print("✅ Conectado a Playwright MCP")

            tools = await session.list_tools()

            print("Herramientas disponibles:")

            for tool in tools.tools:
                print("-", tool.name)

            print("\nAbriendo página...")
            resultado = await session.call_tool(
                    "browser_navigate",
                    arguments={
                        "url": "https://xpedition.utp.edu.pe/productos-digitales/utpclass"
                    }
                )

            if resultado.is_error:
                print("Error de Playwright:", resultado.content)
            else:
                print("¡Navegación completada!")


                for contenido in resultado.content:
                    if contenido.type == "text":
                        print(contenido.text[:1500])

asyncio.run(main())

