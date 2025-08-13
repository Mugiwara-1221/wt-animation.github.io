{
  "bindings": [
    { "authLevel": "anonymous", "type": "httpTrigger", "direction": "in", "name": "req", "methods": [ "delete" ], "route": "session/{code}/lock/{character}" },
    { "type": "http", "direction": "out", "name": "res" }
  ]
}
