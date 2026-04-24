/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class CashierDashboard extends Component {
    setup() {
        this.orm = useService("orm");
        
        // State holds active orders, menu items, and the current draft order
        this.state = useState({
            orders: [],
            menuItems: [],
            cart: {
                order_number: "",
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
        const orders = await this.orm.searchRead(
            'mokopi.order',
            [],
            ['name', 'order_number', 'status', 'line_ids', 'for_bar'],
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
            ['name', 'stock_qty', 'for_bar'], // Added for_bar here
        );
    }

    async fetchStatusOptions() {
        const fields = await this.orm.call(
            'mokopi.order',
            'fields_get',
            [['status']],
        );
        
        this.state.statusOptions = fields.status.selection;
    }

    async fetchFsmRules() {
        this.fsmRules = await this.orm.call(
            'mokopi.order',
            'get_fsm_transitions',
            [],
        );
    }

    addToCart(item) {
        if (item.stock_qty <= 0) return;

        const existingLine = this.state.cart.lines.find(line => line.id === item.id);
        
        if (existingLine) {
            existingLine.qty += 1;
        } else {
            this.state.cart.lines.push({
                id: item.id,
                name: item.name,
                qty: 1,
                for_bar: item.for_bar,
            });
        }
    }

    removeFromCart(index) {
        this.state.cart.lines.splice(index, 1);
    }

    async submitOrder() {
        if (this.state.cart.lines.length === 0) return;

        // 1. Split the cart into Bar items and Kitchen items
        const barLines = this.state.cart.lines.filter(line => line.for_bar === true);
        const kitchenLines = this.state.cart.lines.filter(line => line.for_bar === false);

        const orderNumber = this.state.cart.order_number || "Takeout";
        
        // 2. Prepare an array of orders to create
        const ordersToCreate = [];

        // If there are Bar items, create a Bar Order
        if (barLines.length > 0) {
            ordersToCreate.push({
                order_number: orderNumber,
                status: 'dipesan',
                for_bar: true, // Flag this specific order for the Bar
                line_ids: barLines.map(line => [0, 0, {
                    menu_item_id: line.id,
                    quantity: line.qty
                }])
            });
        }

        // If there are Kitchen items, create a Kitchen Order
        if (kitchenLines.length > 0) {
            ordersToCreate.push({
                order_number: orderNumber,
                status: 'dipesan',
                for_bar: false, // Flag this specific order for the Kitchen
                line_ids: kitchenLines.map(line => [0, 0, {
                    menu_item_id: line.id,
                    quantity: line.qty
                }])
            });
        }

        // 3. Batch Create: Odoo can create multiple records in one ORM call
        if (ordersToCreate.length > 0) {
            await this.orm.create('mokopi.order', ordersToCreate);
        }

        // 4. Reset the cart (Fixed variable alignment)
        this.state.cart = { order_number: "", lines: [] };
        
        // 5. Refresh the screen to show the new orders
        await this.fetchOrders();
    }

    async updateOrderStatus(orderId, newStatus) {
        // 1. Write the new status to the database
        await this.orm.write('mokopi.order', [orderId], {
            status: newStatus
        });

        // 2. Fetch the orders again to refresh the screen
        await this.fetchOrders();
    }

    async updateStock(itemId, changeAmount) {
        // 1. Find the item in the current state
        const item = this.state.menuItems.find(i => i.id === itemId);
        
        // Prevent stock from going below 0 (optional, but good practice)
        const newQty = Math.max(0, item.stock_qty + changeAmount);

        // 2. Write the new quantity to the database
        await this.orm.write('mokopi.stock', [itemId], {
            stock_qty: newQty
        });

        // 3. Refresh only the menu items to update the UI instantly
        await this.fetchMenuItems();
    }

    getValidOptionsForOrder(currentStatus) {
        const allowedKeys = this.fsmRules[currentStatus] || [currentStatus];
        return this.state.statusOptions.filter(option => allowedKeys.includes(option[0]));
    }

    get filteredMenuItems() {
        if (!this.state.searchQuery) {
            return this.state.menuItems;
        }
        
        const query = this.state.searchQuery.toLowerCase();
        return this.state.menuItems.filter(item => 
            item.name.toLowerCase().includes(query)
        );
    }
}

CashierDashboard.template = "mokopi.CashierDashboard";
registry.category("actions").add("mokopi.cashier.dashboard_action", CashierDashboard);