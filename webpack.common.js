const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin')
const FaviconsWebpackPlugin = require('favicons-webpack-plugin');

module.exports = {
  entry: {
    react: './src/react-index.tsx', // Add your React entry point here
  },
  module: {
    rules: [
      {
        test: /\.(js|ts|tsx|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              "@babel/preset-env",
              "@babel/preset-react",
              "@babel/preset-typescript",
            ],
          },
        },
      },
      {
        test: /\.worker\.(js)$/,
        use: { loader: "worker-loader" },
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: "asset/inline",
      },
      {
        test: /\.glsl$/,
        use: "webpack-glsl-loader",
      },
    ],

  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx', '.png'],
  },
  output: {
    filename: '[name].[contenthash].js',
    path: path.resolve(__dirname, 'docs'),
    publicPath: '/tdi/',
    assetModuleFilename: 'assets/[hash][ext][query]',
    clean: true,
    globalObject: 'self',
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Tree Driven Interaction',
      template: 'src/index.html',
      minify: {
        collapseWhitespace: false,
      },
      templateParameters: {
        trackingCode: process.env.TRACKING_CODE
      },
    }),
    new HtmlInlineScriptPlugin(),
    new FaviconsWebpackPlugin({
      // Your source logo (required)
      logo: './src/full_favicon_trimmed.png', // path to your favicon source file
      // Inject the html into the html-webpack-plugin
      inject: true,
      mode: 'light',
      appName: '',
      shortName: '',
    }),
  ],
};
