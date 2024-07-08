# WP Version Updater

`wp-version-updater` is a tool to update WordPress plugin versions. It helps you to increment the version numbers in the `readme.txt` and main PHP file of your WordPress plugin, as well as fetch the latest WordPress and WooCommerce versions to update the "Tested up to" fields.

## Installation

To use the `wp-version-updater` without installing it globally, you can use `npx`:

```sh
npx wp-version-updater
```

## Setup

This script uses WordPress plugin patterns in order to do its job. It relies on the following things:
* README.txt - To obtain the current plugin version
* your-plugin-name.php - To obtain the plugin slug via the 'Text Domain' property and will try to find any constant defined by 'define()' ending in '_VERSION'.

If some of these are missing, the script will not work. Feel free to contribute if you have a specific scenario.