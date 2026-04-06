package expo.modules.fastaccountwatcher

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Native WebSocket-based account watcher that bypasses React Native's
 * WebSocket bridge. Delivers account change notifications directly
 * via Expo Module events (JSI), saving ~150ms of bridge overhead per message.
 *
 * Usage from JS:
 *   subscribe(wsEndpoint, accountPubkey, commitment) → subscriptionId
 *   listen for "onAccountChange" events
 *   unsubscribe(subscriptionId)
 */
class FastAccountWatcherModule : Module() {

  private val client = OkHttpClient.Builder()
    .readTimeout(0, TimeUnit.MILLISECONDS) // no read timeout for WS
    .pingInterval(30, TimeUnit.SECONDS)
    .build()

  private val nextId = AtomicInteger(1)

  // Map of our internal subscription ID → active watcher
  private val watchers = ConcurrentHashMap<Int, AccountWatcher>()

  override fun definition() = ModuleDefinition {
    Name("FastAccountWatcher")

    Events("onAccountChange")

    AsyncFunction("subscribe") { wsEndpoint: String, accountPubkey: String, commitment: String ->
      val watcherId = nextId.getAndIncrement()
      val watcher = AccountWatcher(
        watcherId = watcherId,
        wsEndpoint = wsEndpoint,
        accountPubkey = accountPubkey,
        commitment = commitment,
        onData = { id, base64Data, slot ->
          sendEvent("onAccountChange", mapOf(
            "watcherId" to id,
            "data" to base64Data,
            "slot" to slot
          ))
        },
        onError = { id, error ->
          sendEvent("onAccountChange", mapOf(
            "watcherId" to id,
            "error" to error
          ))
        }
      )
      watchers[watcherId] = watcher
      watcher.connect(client)
      return@AsyncFunction watcherId
    }

    AsyncFunction("unsubscribe") { watcherId: Int ->
      watchers.remove(watcherId)?.close()
    }

    AsyncFunction("unsubscribeAll") {
      watchers.values.forEach { it.close() }
      watchers.clear()
    }

    OnDestroy {
      watchers.values.forEach { it.close() }
      watchers.clear()
    }
  }
}

/**
 * Manages a single WebSocket connection + account subscription.
 * Handles the JSON-RPC protocol for accountSubscribe/accountUnsubscribe.
 */
private class AccountWatcher(
  private val watcherId: Int,
  private val wsEndpoint: String,
  private val accountPubkey: String,
  private val commitment: String,
  private val onData: (Int, String, Long) -> Unit,
  private val onError: (Int, String) -> Unit
) {
  private var ws: WebSocket? = null
  private var rpcSubscriptionId: Long? = null
  private val rpcRequestId = 1

  fun connect(client: OkHttpClient) {
    val request = Request.Builder()
      .url(wsEndpoint)
      .build()

    ws = client.newWebSocket(request, object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) {
        // Send accountSubscribe JSON-RPC request
        val params = JSONArray().apply {
          put(accountPubkey)
          put(JSONObject().apply {
            put("encoding", "base64")
            put("commitment", commitment)
          })
        }
        val rpcRequest = JSONObject().apply {
          put("jsonrpc", "2.0")
          put("id", rpcRequestId)
          put("method", "accountSubscribe")
          put("params", params)
        }
        webSocket.send(rpcRequest.toString())
      }

      override fun onMessage(webSocket: WebSocket, text: String) {
        try {
          val json = JSONObject(text)

          // Handle subscription confirmation response
          if (json.has("id") && json.optInt("id") == rpcRequestId && json.has("result")) {
            rpcSubscriptionId = json.getLong("result")
            return
          }

          // Handle account notification
          if (json.optString("method") == "accountNotification") {
            val params = json.getJSONObject("params")
            val result = params.getJSONObject("result")
            val slot = result.getJSONObject("context").getLong("slot")
            val value = result.getJSONObject("value")
            val dataArray = value.getJSONArray("data")
            val base64Data = dataArray.getString(0)

            onData(watcherId, base64Data, slot)
          }
        } catch (e: Exception) {
          // Silently ignore parse errors — non-notification messages
        }
      }

      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        onError(watcherId, t.message ?: "WebSocket connection failed")
      }

      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
        // Connection closed normally
      }
    })
  }

  fun close() {
    // Send accountUnsubscribe before closing
    val subId = rpcSubscriptionId
    if (subId != null) {
      val unsubRequest = JSONObject().apply {
        put("jsonrpc", "2.0")
        put("id", 2)
        put("method", "accountUnsubscribe")
        put("params", JSONArray().put(subId))
      }
      try {
        ws?.send(unsubRequest.toString())
      } catch (_: Exception) {
        // Best-effort unsubscribe
      }
    }
    ws?.close(1000, "unsubscribed")
    ws = null
  }
}
