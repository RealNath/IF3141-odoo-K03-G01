/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class KdsDashboard extends Component {
    setup() {
        // Bring in Odoo's ORM to talk to the database
        this.orm = useService("orm");
        
        // Define the reactive state. When these change, the UI auto-updates.
        this.state = useState({
            orders: [],
            menuItems: [],
            statusOptions: [],
            searchQuery: "",
        });

        // Define fsm rules for order status
        this.fsmRules = {};

        // Run this before the component renders
        onWillStart(async () => {
            await Promise.all([
                this.fetchOrders(),
                this.fetchStock(),
                this.fetchStatusOptions(),
                this.fetchFsmRules(),
            ]);
        });
    }

    async fetchOrders() {
        const orders = (await this.orm.searchRead(
            'mokopi.order',
            [],
            ['name', 'order_number', 'status', 'line_ids', 'for_bar']
        )).filter(order => !order.for_bar);

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

    async fetchStock() {
        this.state.menuItems = (await this.orm.searchRead(
            'mokopi.stock',
            [], 
            ['name', 'stock_qty']
        )).filter(item => !item.for_bar);
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

    onDragStart(ev, order) {
        this.draggedOrderId = order.id;
    }

    // Agar dapat drop elemen
    onDragOver(ev) {
        ev.preventDefault();
    }

    async onDrop(ev, targetOrder) {
        ev.preventDefault();
        
        if (!this.draggedOrderId || this.draggedOrderId === targetOrder.id) {
            return; // Batalkan jika urutan tidak berubah
        }

        const draggedIndex = this.state.orders.findIndex(o => o.id === this.draggedOrderId);
        const targetIndex = this.state.orders.findIndex(o => o.id === targetOrder.id);

        if (draggedIndex === -1 || targetIndex === -1) return;

        // Pindahkan elemen pada array (update lokal dahulu, agar UI respon dengan instant)
        const [draggedOrder] = this.state.orders.splice(draggedIndex, 1);
        this.state.orders.splice(targetIndex, 0, draggedOrder);

        // Beri urutan baru ke state lokal
        const updatePromises = this.state.orders.map((o, index) => {
            const newSeq = index + 1;
            // Hanya memperbarui DB
            return this.orm.write('mokopi.order', [o.id], { sequence: newSeq });
        });

        // 3. Eksekusi semua perubahan ke database tanpa memblokir UI terlalu lama
        await Promise.all(updatePromises);

        this.draggedOrderId = null;
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
        // Find the current item in our state
        const item = this.state.menuItems.find(i => i.id === itemId);
        const newQty = item.stock_qty + changeAmount;

        // Write the new quantity to the database
        await this.orm.write('mokopi.stock', [itemId], {
            stock_qty: newQty
        });

        // Refresh the UI by fetching fresh stocks
        await this.fetchStock();
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

// Bind the component to the XML template we created
KdsDashboard.template = "mokopi.KdsDashboard";

// Register this component as an action in Odoo
registry.category("actions").add("mokopi.kds.dashboard_action", KdsDashboard);