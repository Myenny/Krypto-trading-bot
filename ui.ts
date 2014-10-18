/// <reference path="models.ts" />

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require("path");

interface OrderRequestFromUI {
    exchange : string;
    side : string;
    price : number;
    quantity : number;
    timeInForce : string;
    orderType : string
}

class UI {
    NewOrder : Evt<SubmitNewOrder> = new Evt<SubmitNewOrder>();
    CancelOrder : Evt<OrderCancel> = new Evt<OrderCancel>();
    _log : Logger = log("Hudson:UI");
    _brokers : Array<IBroker>;

    constructor(public brokers : Array<IBroker>) {
        this._brokers = brokers;

        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, "index.html"));
        });

        http.listen(3000, () => this._log('listening on *:3000'));

        io.on('connection', sock => {
            sock.emit("hello");
            sock.emit("order-options", {
                availableTifs: TimeInForce,
                availableExchanges: Exchange,
                availableSides: Side,
                availableOrderTypes: OrderType,
                availableOrderStatuses: OrderStatus,
                availableLiquidityTypes: Liquidity
            });

            this._brokers.filter(b => b.currentBook() != null).forEach(b => this.sendUpdatedMarket(b.currentBook()));
            this._brokers.forEach(b => b.allOrderStates().forEach(s => this.sendOrderStatusUpdate(s)));

            sock.on("submit-order", (o : OrderRequestFromUI) => {
                this._log("got new order %o", o);
                var order = new SubmitNewOrder(Side[o.side], o.quantity, OrderType[o.orderType],
                    o.price, TimeInForce[o.timeInForce], Exchange[o.exchange]);
                this.NewOrder.trigger(order);
            });

            sock.on("cancel-order", (o : OrderStatusReport) => {
                this._log("got new cancel req %o", o);
                this.CancelOrder.trigger(new OrderCancel(o.orderId, o.exchange));
            });
        });
    }

    sendOrderStatusUpdate = (msg : OrderStatusReport) => {
        io.emit("order-status-report", msg);
    };

    sendUpdatedMarket = (book : MarketBook) => {
        var b = {bidPrice: book.top.bid.price,
            bidSize: book.top.bid.size,
            askPrice: book.top.ask.price,
            askSize: book.top.ask.size,
            exchangeName: Exchange[book.exchangeName]};
        io.emit("market-book", b);
    };
}