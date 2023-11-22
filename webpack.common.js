const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const FaviconsWebpackPlugin = require('favicons-webpack-plugin');
const { WebpackManifestPlugin } = require('webpack-manifest-plugin');

module.exports = {
  entry: {
    react: './src/react-index.tsx',
    worker: './src/workers/dynamicFunctions.worker.ts',
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
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: "asset/inline",
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
    new WebpackManifestPlugin({
      fileName: 'asset-manifest.json',
      publicPath: '/tdi/',
    }),
    new HtmlWebpackPlugin({
      title: 'Tree Driven Interaction',
      template: 'src/index.html',
      excludeChunks: ['worker'],
      minify: {
        collapseWhitespace: false,
      },
      templateParameters: (compilation) => {
        const assets = compilation.getStats().toJson().assetsByChunkName;
        return {
          assets,
          htmlWebpackPlugin: {
            files: assets,
            options: {
              templateParameters: {
                trackingCode: process.env.TRACKING_CODE,
              },
            },
          },
        };
      },
    }),
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
