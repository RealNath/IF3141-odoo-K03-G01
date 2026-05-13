/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class CashierDashboard extends Component {
    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");

        this.state = useState({
            orders: [],
            menuItems: [],
            isModalOpen: false,
            cart: {
                order_number: "",
                customer_name: "",
                no_meja: "",
                lines: [],
            },
            statusOptions: [],
            searchQuery: "",
        });

        this.fsmRules = {};

        onWillStart(async () => {
            await Promise.all([
                this.fetchMenuItems(),
                this.fetchOrders(),
                this.fetchStatusOptions(),
                this.fetchFsmRules(),
            ]);
        });
    }

    async fetchOrders() {
        // Filter out finished/cancelled/rejected orders
        const orders = await this.orm.searchRead(
            'mokopi.order',
            [['status', '!=', 'selesai']],
            ['name', 'order_number', 'status', 'line_ids', 'for_bar', 'customer_name', 'no_meja', 'sequence'],
            { order: 'sequence asc, id asc' }
        );

        const allLineIds = orders.flatMap(order => order.line_ids);
        
        if (allLineIds.length > 0) {
            const lines = await this.orm.read(
                'mokopi.order.line',
                allLineIds,
                ['menu_item_id', 'quantity', 'notes'],
            )

            orders.forEach(order => {
                order.full_lines = lines.filter(line => order.line_ids.includes(line.id));
            });
        } else {
            orders.forEach(order => order.full_lines = []);
        }

        this.state.orders = orders;
    }

    async fetchMenuItems() {
        this.state.menuItems = await this.orm.searchRead(
            'mokopi.stock',
            [],
            ['name', 'stock_qty', 'for_bar', 'price'],
        );
    }

    async updateStock(itemId, delta) {
        const item = this.state.menuItems.find(i => i.id === itemId);
        if (item) {
            const newQty = Math.max(0, item.stock_qty + delta);
            await this.orm.write('mokopi.stock', [itemId], { stock_qty: newQty });
            await this.fetchMenuItems();
        }
    }

    async fetchStatusOptions() {
        const fields = await this.orm.call('mokopi.order', 'fields_get', [['status']]);
        this.state.statusOptions = fields.status.selection;
    }

    async fetchFsmRules() {
        this.fsmRules = await this.orm.call('mokopi.order', 'get_fsm_transitions', []);
    }

    openModal() {
        this.state.isModalOpen = true;
        this.state.cart = {
            order_number: "INV/" + Date.now().toString().slice(-6),
            customer_name: "",
            no_meja: "",
            lines: [],
        };
    }

    closeModal() {
        this.state.isModalOpen = false;
    }

    addToCart(item) {
        const existingLine = this.state.cart.lines.find(line => line.id === item.id);
        const currentQty = existingLine ? existingLine.qty : 0;

        if (currentQty >= item.stock_qty) {
            this.notification.add(`Maaf, stok ${item.name} habis atau tidak mencukupi.`, { type: 'danger' });
            return;
        }

        if (existingLine) {
            existingLine.qty += 1;
        } else {
            this.state.cart.lines.push({
                id: item.id,
                name: item.name,
                qty: 1,
                price: item.price || 0,
                for_bar: item.for_bar,
                max_qty: item.stock_qty
            });
        }
    }

    increaseQty(index) {
        const line = this.state.cart.lines[index];
        if (line.qty < line.max_qty) {
            line.qty += 1;
        } else {
            this.notification.add(`Batas stok tercapai.`, { type: 'warning' });
        }
    }

    decreaseQty(index) {
        const line = this.state.cart.lines[index];
        if (line.qty > 1) {
            line.qty -= 1;
        } else {
            this.removeFromCart(index);
        }
    }

    removeFromCart(index) {
        this.state.cart.lines.splice(index, 1);
    }

    async submitOrder() {
        if (!this.state.cart.customer_name) {
            this.notification.add("Nama Pelanggan wajib diisi!", { type: 'danger' });
            return;
        }
        if (this.state.cart.lines.length === 0) return;

        const barLines = this.state.cart.lines.filter(line => line.for_bar === true);
        const kitchenLines = this.state.cart.lines.filter(line => line.for_bar === false);
        const orderNumber = this.state.cart.order_number || "Takeout";
        const ordersToCreate = [];

        const commonData = {
            order_number: orderNumber,
            customer_name: this.state.cart.customer_name,
            no_meja: this.state.cart.no_meja,
            status: 'dipesan',
        };

        if (barLines.length > 0) {
            ordersToCreate.push({
                ...commonData,
                for_bar: true,
                line_ids: barLines.map(line => [0, 0, { menu_item_id: line.id, quantity: line.qty }])
            });
        }

        if (kitchenLines.length > 0) {
            ordersToCreate.push({
                ...commonData,
                for_bar: false,
                line_ids: kitchenLines.map(line => [0, 0, { menu_item_id: line.id, quantity: line.qty }])
            });
        }

        try {
            await this.orm.create('mokopi.order', ordersToCreate);
            this.notification.add("Pesanan berhasil dikirim!", { type: 'success' });
            this.state.isModalOpen = false;
            await Promise.all([this.fetchOrders(), this.fetchMenuItems()]);
        } catch (error) {
            // Error handling handled by Odoo RPC usually, but added fetch refresh
            await this.fetchMenuItems();
        }
    }

    async updateOrderStatus(orderId, newStatus) {
        try {
            await this.orm.write('mokopi.order', [orderId], { status: newStatus });
            // Refresh orders and menu items (stock)
            await Promise.all([
                this.fetchOrders(),
                this.fetchMenuItems()
            ]);
        } catch (error) {
            // Error will be shown by Odoo notification if write fails due to UserError
            await this.fetchOrders();
        }
    }

    getValidOptionsForOrder(order) {
        if (!this.fsmRules || Object.keys(this.fsmRules).length === 0) {
            return [[order.status, order.status]];
        }

        // Tentukan rule set berdasarkan jenis pesanan (Bar vs Kitchen)
        let ruleSet;
        if (order.for_bar) {
            ruleSet = this.fsmRules['bar'];
        } else {
            // Sesuai permintaan: Kasir hanya boleh batal/selesai untuk menu Kitchen
            ruleSet = this.fsmRules['cashier_kitchen'];
        }

        // Jika ruleSet spesifik tidak ditemukan, coba gunakan fsmRules langsung (fallback)
        ruleSet = ruleSet || this.fsmRules;

        const allowedKeys = (ruleSet && ruleSet[order.status]) || [order.status];
        return this.state.statusOptions.filter(option => allowedKeys.includes(option[0]));
    }

    get filteredMenuItems() {
        const query = (this.state.searchQuery || "").toLowerCase();
        return this.state.menuItems.filter(item => item.name.toLowerCase().includes(query));
    }

    get totalPrice() {
        return this.state.cart.lines.reduce((acc, line) => acc + (line.price * line.qty), 0);
    }
}

CashierDashboard.template = "mokopi.CashierDashboard";
registry.category("actions").add("mokopi.cashier.dashboard_action", CashierDashboard);
