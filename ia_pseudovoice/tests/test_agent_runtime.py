import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from langchain_core.messages import AIMessage
from mcp.types import CallToolResult, ListToolsResult, Tool

from pseudovoice.agent_runtime import (
    ALLOWED_TOOLS,
    classify_tool,
    contains_secret_fields,
    is_public_target,
    safe_origin,
    AgentRuntime,
    AgentTaskStart,
    _tool_schema,
)
from types import SimpleNamespace


class AgentRuntimeSafetyTests(unittest.TestCase):
    def test_auto_navigation_is_opt_in_and_origin_scoped(self):
        runtime = AgentRuntime()
        args = {"url": "https://www.google.com/search?q=hello"}
        prefs = {"allowPublicNavigation": True, "allowRead": True,
                 "publicNavigationOrigins": ["https://www.google.com"]}
        self.assertTrue(runtime._requires_approval("browser_navigate", args, prefs))
        prefs["autoApprovePublicNavigation"] = True
        self.assertFalse(runtime._requires_approval("browser_navigate", args, prefs))
        for destination in ["https://evil.com", "https://www.google.com.evil.com", "http://www.google.com", "https://www.google.com:444"]:
            self.assertTrue(runtime._requires_approval("browser_navigate", {"url": destination}, prefs))
        for tool in ["browser_click", "browser_fill_form", "browser_file_upload", "browser_type"]:
            self.assertTrue(runtime._requires_approval(tool, {}, prefs))
        prefs["allowAuthenticatedNavigation"] = True
        self.assertTrue(runtime._requires_approval("browser_navigate", args, prefs))
        prefs["allowAuthenticatedNavigation"] = False
        prefs["autoApprovePublicNavigation"] = False
        self.assertTrue(runtime._requires_approval("browser_navigate", args, prefs))

    def test_mcp_wire_schema_uses_installed_sdk_attributes(self):
        parameters = {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]}
        tool = Tool.model_validate({"name": "browser_navigate", "description": "Navigate", "inputSchema": parameters})

        converted = _tool_schema(tool)

        self.assertEqual(converted["function"]["name"], "browser_navigate")
        self.assertEqual(converted["function"]["parameters"], parameters)

    def test_arbitrary_code_tools_are_not_allowlisted(self):
        self.assertNotIn("browser_run_code_unsafe", ALLOWED_TOOLS)
        self.assertNotIn("browser_evaluate", ALLOWED_TOOLS)

    def test_write_actions_are_classified_for_approval(self):
        self.assertEqual(classify_tool("browser_click"), "write")
        self.assertEqual(classify_tool("browser_navigate"), "write")
        self.assertEqual(classify_tool("browser_snapshot"), "read")
        with self.assertRaises(ValueError):
            classify_tool("browser_run_code_unsafe")

    def test_public_navigation_rejects_local_and_non_https_destinations(self):
        self.assertTrue(is_public_target("https://example.com/reports"))
        self.assertFalse(is_public_target("http://example.com"))
        self.assertFalse(is_public_target("https://localhost:8931/mcp"))
        self.assertFalse(is_public_target("https://192.168.1.5/admin"))
        self.assertFalse(is_public_target("file:///C:/secret.txt"))
        self.assertFalse(is_public_target("https://web.whatsapp.com/"))

    def test_origin_does_not_keep_credentials_or_paths(self):
        self.assertEqual(safe_origin("https://example.com/path?q=private"), "example.com")
        self.assertIsNone(safe_origin("https://user:pass@example.com/path"))
        self.assertIsNone(safe_origin("file:///C:/private"))

    def test_credential_fields_are_blocked_even_when_labeled(self):
        self.assertTrue(contains_secret_fields({"password": "not persisted"}))
        self.assertTrue(contains_secret_fields({"fields": [{"label": "Password", "value": "abc"}]}))
        self.assertFalse(contains_secret_fields({"fields": [{"label": "Report title", "value": "Q3"}]}))

    def test_upload_permission_is_separate_from_form_fill(self):
        runtime = AgentRuntime()
        listed = [SimpleNamespace(name=name) for name in ("browser_fill_form", "browser_file_upload")]
        prefs = {"allowFormFill": True, "allowUploads": False, "allowModifications": True,
                 "allowRead": True, "allowPublicNavigation": True, "allowAuthenticatedNavigation": False}
        self.assertEqual([tool.name for tool in runtime._allowed_tools(listed, prefs)], ["browser_fill_form"])

    def test_authenticated_navigation_still_requires_public_https(self):
        runtime = AgentRuntime()
        prefs = {"allowPublicNavigation": False, "allowAuthenticatedNavigation": True, "allowRead": True}
        self.assertTrue(runtime._permission_allows("browser_navigate", {"url": "https://example.com"}, prefs))
        self.assertFalse(runtime._permission_allows("browser_navigate", {"url": "http://example.com"}, prefs))
        self.assertFalse(runtime._permission_allows("browser_navigate", {"url": "https://localhost"}, prefs))


class AgentRuntimeMcpTests(unittest.IsolatedAsyncioTestCase):
    async def test_navigation_result_completes_with_real_sdk_models(self):
        await self.check_navigation()

    async def test_auto_navigation_executes_without_approval_and_speaks_result(self):
        await self.check_navigation(auto=True, spoken=True)

    async def test_revoked_auto_navigation_requests_approval(self):
        await self.check_navigation(auto=True, revoked=True)

    async def check_navigation(self, auto=False, spoken=False, revoked=False):
        runtime = AgentRuntime()
        runtime._has_capacity = AsyncMock(return_value=True)
        runtime._record_step = AsyncMock()
        runtime._request_approval = AsyncMock(return_value={"id": 1})
        runtime._await_approval = AsyncMock(return_value={"url": "https://example.com"})
        runtime._save_message = AsyncMock()
        runtime._finish = AsyncMock()

        tool = Tool.model_validate({"name": "browser_navigate", "inputSchema": {
            "type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"],
        }})
        mcp = AsyncMock()
        mcp.__aenter__.return_value = mcp
        mcp.list_tools.return_value = ListToolsResult(tools=[tool])
        mcp.call_tool.return_value = CallToolResult.model_validate({
            "content": [{"type": "text", "text": "Page URL: https://example.com"}], "isError": False,
        })
        transport = AsyncMock()
        transport.__aenter__.return_value = (object(), object())

        client = AsyncMock()
        client.__aenter__.return_value = client
        client.get.side_effect = [
            httpx.Response(200, json={}, request=httpx.Request("GET", "https://backend.test/context")),
            httpx.Response(200, json=[], request=httpx.Request("GET", "https://backend.test/messages")),
        ]
        llm = MagicMock()
        llm.bind_tools.return_value = llm
        usage = {"input_tokens": 10, "output_tokens": 10, "total_tokens": 20}
        llm.ainvoke = AsyncMock(side_effect=[
            AIMessage(content="", tool_calls=[{"name": "browser_navigate", "args": {"url": "https://example.com"}, "id": "navigate-1"}], usage_metadata=usage),
            AIMessage(content="La página se abrió.", usage_metadata=usage),
        ])
        settings = SimpleNamespace(
            BACKEND_API_URL="https://backend.test/api", INTERNAL_SERVICE_KEY="test-key",
            PLAYWRIGHT_MCP_URL="http://localhost:8931/mcp", DEEPSEEK_API_KEY="test-key",
            DEEPSEEK_BASE_URL="https://model.test", DEEPSEEK_MODEL="test-model",
            DEEPSEEK_INPUT_USD_PER_MILLION_TOKENS=0.3, DEEPSEEK_OUTPUT_USD_PER_MILLION_TOKENS=1.2,
        )
        prefs = {"allowPublicNavigation": True, "allowRead": True, "maxSteps": 15, "deepseekBudgetUsd": 0.02}
        if auto:
            prefs.update(autoApprovePublicNavigation=True, publicNavigationOrigins=["https://example.com"])
        runtime.preferences = AsyncMock(return_value={**prefs, "autoApprovePublicNavigation": auto and not revoked})
        on_result = AsyncMock(return_value=0.0002) if spoken else None

        with patch("pseudovoice.agent_runtime.settings", settings), \
             patch("pseudovoice.agent_runtime.httpx.AsyncClient", return_value=client), \
             patch("pseudovoice.agent_runtime.streamable_http_client", return_value=transport), \
             patch("pseudovoice.agent_runtime.ClientSession", return_value=mcp), \
             patch("pseudovoice.agent_runtime.ChatOpenAI", return_value=llm), \
             patch("pseudovoice.server.search_conversation_memories", new=AsyncMock(return_value=[])):
            await runtime._execute(1, 2, AgentTaskStart(character_id=3, conversation_id=4, text="Abre https://example.com"), "test-token", prefs, uuid.uuid4(), on_result)

        mcp.call_tool.assert_awaited_once_with("browser_navigate", arguments={"url": "https://example.com"})
        if auto and not revoked:
            runtime._request_approval.assert_not_awaited()
        else:
            runtime._request_approval.assert_awaited_once()
        if spoken:
            on_result.assert_awaited_once()
            self.assertEqual(on_result.await_args.args[0], "La página se abrió.")
            self.assertEqual(runtime._finish.await_args.args[-1], 0.0002)
        self.assertEqual(runtime._finish.await_args.args[1], "completed")
        self.assertEqual(runtime._record_step.await_args.args[5], "succeeded")
        runtime._save_message.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
