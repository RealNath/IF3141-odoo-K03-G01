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
        const orders = (await this.orm.searchRead(
            'mokopi.order',
            [['for_bar', '=', false]],
            ['name', 'order_number', 'status', 'line_ids', 'for_bar', 'customer_name', 'no_meja'],
            { order: 'id desc' }
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

    async fetchStock() {
        // Kitchen hanya melihat stok makanan (non-bar)
        this.state.menuItems = await this.orm.searchRead(
            'mokopi.stock',
            [['for_bar', '=', false]],
            ['name', 'stock_qty', 'for_bar']
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
            { dashboard_type: 'kitchen' }
        );
    }

    async updateOrderStatus(orderId, newStatus) {
        await this.orm.write('mokopi.order', [orderId], {
            status: newStatus
        });
        await this.fetchOrders();
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
