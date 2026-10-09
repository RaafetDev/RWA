Imports System
Imports System.Net.WebSockets
Imports System.Text
Imports System.Threading
Imports System.Threading.Tasks

Module Program
    Sub Main()
        MainAsync().GetAwaiter().GetResult()
    End Sub

    Async Function MainAsync() As Task
        Dim ws As New ClientWebSocket()
        Await ws.ConnectAsync(New Uri("ws://127.0.0.1:19800/rwa"), CancellationToken.None)
        Console.WriteLine("Connected from VB.NET!")

        Dim req As String = "{""jsonrpc"":""2.0"",""id"":1,""method"":""rwa.ping""}"
        Dim reqBytes = Encoding.UTF8.GetBytes(req)
        Await ws.SendAsync(New ArraySegment(Of Byte)(reqBytes), WebSocketMessageType.Text, True, CancellationToken.None)

        Dim buffer(4096) As Byte
        Dim res = Await ws.ReceiveAsync(New ArraySegment(Of Byte)(buffer), CancellationToken.None)
        Dim msg = Encoding.UTF8.GetString(buffer, 0, res.Count)
        Console.WriteLine("Received: " & msg)

        Await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Done", CancellationToken.None)
    End Function
End Module
