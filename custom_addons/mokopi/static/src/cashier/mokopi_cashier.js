/** @odoo-module **/

import { Component, useState, onWillStart, onMounted, onWillUnmount } from "@odoo/owl";
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
        this.pollingInterval = null;
        this.serverMenuStock = {}; // Cache of server stock quantities by item id

        onWillStart(async () => {
            await Promise.all([
                this.fetchMenuItems(),
                this.fetchOrders(),
                this.fetchStatusOptions(),
                this.fetchFsmRules(),
            ]);
        });

        onMounted(() => {
            this.startPolling();
        });

        onWillUnmount(() => {
            this.stopPolling();
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
        // Cache original server stock for accurate validation
        this.state.menuItems.forEach(item => {
            this.serverMenuStock[item.id] = item.stock_qty;
        });
        // Reapply cart deductions to preserve local stock validation during order creation
        this.applyCartDeductions();
    }

    applyCartDeductions() {
        // Reduce menu item display stock by quantities currently in cart
        // Uses cached server stock for accurate validation
        this.state.menuItems.forEach(item => {
            const cartLine = this.state.cart.lines.find(line => line.id === item.id);
            // Start from cached server stock, then reduce by cart quantity
            let displayStock = this.serverMenuStock[item.id] || 0;
            if (cartLine) {
                displayStock = Math.max(0, displayStock - cartLine.qty);
            }
            item.stock_qty = displayStock;
        });
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

        if (item.stock_qty <= 0) {
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
                max_qty: item.stock_qty,
                notes: "",
            });
        }

        this.state.menuItems.find(t => t.id === item.id).stock_qty -= 1;
    }

    increaseQty(index) {
        const line = this.state.cart.lines[index];
        if (line.qty < line.max_qty) {
            line.qty += 1;
            this.state.menuItems.find(t => t.id === line.id).stock_qty += 1;
        } else {
            this.notification.add(`Batas stok tercapai.`, { type: 'warning' });
        }
    }

    decreaseQty(index) {
        const line = this.state.cart.lines[index];
        if (line.qty > 1) {
            line.qty -= 1;
            this.state.menuItems.find(t => t.id === line.id).stock_qty += 1;
        } else {
            this.removeFromCart(index);
        }
    }

    removeFromCart(index) {
        const line = this.state.cart.lines[index];
        this.state.menuItems.find(t => t.id === line.id).stock_qty += line.qty;
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
                line_ids: barLines.map(line => [0, 0, { menu_item_id: line.id, quantity: line.qty, notes: line.notes }])
            });
        }

        if (kitchenLines.length > 0) {
            ordersToCreate.push({
                ...commonData,
                for_bar: false,
                line_ids: kitchenLines.map(line => [0, 0, { menu_item_id: line.id, quantity: line.qty, notes: line.notes }])
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

    startPolling() {
        // Poll every 5 seconds to check for new orders and stock updates
        // Menu items are fetched for validation during order creation
        this.pollingInterval = setInterval(async () => {
            try {
                await Promise.all([this.fetchOrders(), this.fetchMenuItems()]);
            } catch (error) {
                console.warn('Polling error in cashier dashboard:', error);
            }
        }, 1000);
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
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

    getCartLineStock(lineId) {
        // Return the cached server stock for the item
        return this.serverMenuStock[lineId] || 0;
    }

    isCartLineOversold(lineIndex) {
        // Check if cart line quantity exceeds actual server stock
        const line = this.state.cart.lines[lineIndex];
        const serverStock = this.serverMenuStock[line.id] || 0;
        return line.qty > serverStock;
    }

    hasOversoldItems() {
        // Check if any cart items exceed available stock
        return this.state.cart.lines.some((_, index) => this.isCartLineOversold(index));
    }
}

CashierDashboard.template = "mokopi.CashierDashboard";
registry.category("actions").add("mokopi.cashier.dashboard_action", CashierDashboard);
