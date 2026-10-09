// Core/templates/clients/csharp-manager/RitaWappWsClient.cs
// Reusable zero-dependency WebSocket JSON-RPC 2.0 client for .NET applications.

using System;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Concurrent;

namespace RitaWappManager
{
    public class RitaWappWsClient : IDisposable
    {
        private ClientWebSocket? _ws;
        private readonly Uri _serverUri;
        private readonly string? _token;
        private readonly ConcurrentDictionary<long, TaskCompletionSource<JsonElement>> _pendingRequests = new();
        private long _requestId = 0;
        private CancellationTokenSource? _cts;

        public event Action<string, JsonElement>? OnEventReceived;

        public RitaWappWsClient(string serverUrl = "ws://127.0.0.1:19800/rwa", string? token = null)
        {
            _serverUri = new Uri(serverUrl);
            _token = token;
        }

        public async Task ConnectAsync(CancellationToken cancellationToken = default)
        {
            _ws = new ClientWebSocket();
            await _ws.ConnectAsync(_serverUri, cancellationToken);
            _cts = new CancellationTokenSource();
            _ = ReceiveLoopAsync(_cts.Token);

            // Handshake
            var helloParams = new { token = _token, clientName = "CSharpManager", clientVersion = "1.0.1" };
            var res = await SendRequestAsync("rwa.hello", helloParams, cancellationToken);
        }

        public async Task<JsonElement> SendRequestAsync(string method, object? parameters = null, CancellationToken cancellationToken = default)
        {
            if (_ws == null || _ws.State != WebSocketState.Open)
                throw new InvalidOperationException("WebSocket is not connected.");

            long id = Interlocked.Increment(ref _requestId);
            var reqObj = new
            {
                jsonrpc = "2.0",
                id = id,
                method = method,
                @params = parameters
            };

            var tcs = new TaskCompletionSource<JsonElement>();
            _pendingRequests[id] = tcs;

            string json = JsonSerializer.Serialize(reqObj);
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, cancellationToken);

            using var reg = cancellationToken.Register(() => tcs.TrySetCanceled());
            return await tcs.Task;
        }

        private async Task ReceiveLoopAsync(CancellationToken ct)
        {
            var buffer = new byte[65536];
            while (!ct.IsCancellationRequested && _ws?.State == WebSocketState.Open)
            {
                try
                {
                    var result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
                    if (result.MessageType == WebSocketMessageType.Close) break;

                    string message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    using var doc = JsonDocument.Parse(message);
                    var root = doc.RootElement.Clone();

                    if (root.TryGetProperty("id", out var idProp) && idProp.ValueKind == JsonValueKind.Number)
                    {
                        long id = idProp.GetInt64();
                        if (_pendingRequests.TryRemove(id, out var tcs))
                        {
                            if (root.TryGetProperty("result", out var resProp))
                            {
                                tcs.TrySetResult(resProp);
                            }
                            else if (root.TryGetProperty("error", out var errProp))
                            {
                                tcs.TrySetException(new Exception(errProp.ToString()));
                            }
                        }
                    }
                    else if (root.TryGetProperty("method", out var methodProp) && methodProp.GetString() == "event")
                    {
                        if (root.TryGetProperty("params", out var paramsProp))
                        {
                            string topic = paramsProp.GetProperty("topic").GetString() ?? "";
                            var data = paramsProp.GetProperty("data");
                            OnEventReceived?.Invoke(topic, data);
                        }
                    }
                }
                catch
                {
                    break;
                }
            }
        }

        public void Dispose()
        {
            _cts?.Cancel();
            _ws?.Dispose();
        }
    }
}
