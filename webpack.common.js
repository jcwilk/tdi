const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin')

module.exports = {
  entry: {
    main: './src/index.ts',
    react: './src/react-index.jsx', // Add your React entry point here
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
        test: /\.worker\.(js|ts)$/,
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
      title: 'Template',
      template: 'src/index.html',
      minify: {
        collapseWhitespace: false,
      },
    }),
    new HtmlInlineScriptPlugin(),

    // Add this block to copy the Jasmine files to the output folder
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'jasmine/jasmine.js'),
          to: path.resolve(__dirname, 'docs/jasmine/'),
        },
      ],
    }),
  ],
};
