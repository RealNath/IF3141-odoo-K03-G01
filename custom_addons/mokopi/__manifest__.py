{
    'name': 'Mokopi',
    'version': '1.0',
    'summary': 'Manage ongoing orders and kitchen stock',
    'category': 'Point of Sale',
    'depends': ['base', 'web'],
    'data': [
        'security/ir.model.access.csv',
        'views/mokopi_log_views.xml',
        'views/mokopi_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'mokopi/static/src/kitchen/mokopi_kitchen.js',
            'mokopi/static/src/kitchen/mokopi_kitchen.xml',
            'mokopi/static/src/kitchen/mokopi_kitchen.scss',

            'mokopi/static/src/cashier/mokopi_cashier.js',
            'mokopi/static/src/cashier/mokopi_cashier.xml',
        ],
    },
    'installable': True,
    'application': True,
}