import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.CountDownLatch;

public class RitaWappJavaClient {
    public static void main(String[] args) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        HttpClient client = HttpClient.newHttpClient();

        WebSocket ws = client.newWebSocketBuilder()
            .buildAsync(URI.create("ws://127.0.0.1:19800/rwa"), new WebSocket.Listener() {
                @Override
                public void onOpen(WebSocket webSocket) {
                    System.out.println("Connected to RitaWapp wsApi!");
                    webSocket.sendText("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"rwa.ping\"}", true);
                    WebSocket.Listener.super.onOpen(webSocket);
                }

                @Override
                public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
                    System.out.println("Received: " + data);
                    latch.countDown();
                    return WebSocket.Listener.super.onText(webSocket, data, last);
                }
            }).join();

        latch.await();
        ws.sendClose(WebSocket.NORMAL_CLOSURE, "Done");
    }
}
