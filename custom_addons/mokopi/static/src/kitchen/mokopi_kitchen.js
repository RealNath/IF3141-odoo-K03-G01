/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class KdsDashboard extends Component {
    setup() {
        this.orm = useService("orm");
        
        this.state = useState({
            orders: [],
            menuItems: [],
            statusOptions: [],
            searchQuery: "",
        });

        this.fsmRules = {};

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
        // Kitchen hanya melihat pesanan yang ditujukan untuk Kitchen (!for_bar)
        // Filter out finished/cancelled/rejected orders
        // Fetch ordered by sequence to support drag and drop ordering
        const orders = (await this.orm.searchRead(
            'mokopi.order',
            [
                ['for_bar', '=', false],
                ['status', 'not in', ['selesai', 'dibatalkan', 'ditolak']]
            ],
            ['name', 'order_number', 'status', 'line_ids', 'for_bar', 'customer_name', 'no_meja', 'sequence'],
            { order: 'sequence asc, id asc' }
        ));

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

    // --- DRAG AND DROP METHODS ---
    onDragStart(ev, order) {
        this.draggedOrderId = order.id;
        // setData is required for drag and drop to work in many browsers (Chrome/Firefox)
        // It must be a string
        ev.dataTransfer.setData('text/plain', String(order.id));
        ev.dataTransfer.effectAllowed = 'move';

        // Add visual feedback
        const card = ev.target.closest('.card');
        if (card) {
            card.style.opacity = "0.5";
        }
    }

    onDragOver(ev) {
        if (ev.preventDefault) {
            ev.preventDefault();
        }
        ev.dataTransfer.dropEffect = 'move';
        return false;
    }

    async onDrop(ev, targetOrder) {
        ev.preventDefault();

        // Reset opacity for all cards
        const allCards = document.querySelectorAll('.o_kds_dashboard .card');
        allCards.forEach(c => c.style.opacity = "1");

        if (!this.draggedOrderId || this.draggedOrderId === targetOrder.id) {
            this.draggedOrderId = null;
            return;
        }

        const draggedIndex = this.state.orders.findIndex(o => o.id === this.draggedOrderId);
        const targetIndex = this.state.orders.findIndex(o => o.id === targetOrder.id);

        if (draggedIndex === -1 || targetIndex === -1) {
            this.draggedOrderId = null;
            return;
        }

        // Reorder locally for instant feedback
        const [draggedOrder] = this.state.orders.splice(draggedIndex, 1);
        this.state.orders.splice(targetIndex, 0, draggedOrder);

        // Update sequence in background using the new mass-update method
        try {
            const orderIds = this.state.orders.map(o => o.id);
            await this.orm.call('mokopi.order', 'resequence_orders', [orderIds]);
        } catch (error) {
            console.error("Failed to update sequence:", error);
            await this.fetchOrders();
        } finally {
            this.draggedOrderId = null;
        }
    }
    // -----------------------------

    async fetchStock() {
        // Kitchen hanya melihat stok makanan (non-bar)
        this.state.menuItems = await this.orm.searchRead(
            'mokopi.stock',
            [['for_bar', '=', false]],
            ['name', 'stock_qty', 'for_bar']
        );
    }

    async updateStock(itemId, delta) {
        const item = this.state.menuItems.find(i => i.id === itemId);
        if (item) {
            const newQty = Math.max(0, item.stock_qty + delta);
            await this.orm.write('mokopi.stock', [itemId], { stock_qty: newQty });
            await this.fetchStock();
        }
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
            { dashboard_type: 'kitchen' }
        );
    }

    async updateOrderStatus(orderId, newStatus) {
        await this.orm.write('mokopi.order', [orderId], {
            status: newStatus
        });
        // Refresh orders and stock to show recovered quantities
        await Promise.all([
            this.fetchOrders(),
            this.fetchStock()
        ]);
    }

    getValidOptionsForOrder(order) {
        if (!this.fsmRules || !this.fsmRules['kitchen']) {
            return [[order.status, order.status]];
        }

        // Kitchen always uses kitchen rules
        const ruleSet = this.fsmRules['kitchen'] || {};
        const allowedKeys = ruleSet[order.status] || [order.status];
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

KdsDashboard.template = "mokopi.KdsDashboard";
registry.category("actions").add("mokopi.kds.dashboard_action", KdsDashboard);
