import { Component, type ReactNode } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Text, Button, Card } from "react-native-paper";

interface Props {
  children: ReactNode;
  /** デフォルトのリセット動作: state を初期化して再描画。
   *  追加でアプリ全体の state クリーンアップが必要な場合は渡す。 */
  onReset?: () => void;
  /** 補足した瞬間に呼ばれる。**フォールバック画面から先に進めない場所**で要る
   *  （例: 起動演出は「終わった」ことにしないとアプリ本体に入れない）。 */
  onError?: (error: Error) => void;
}

interface State {
  error: Error | null;
}

/**
 * 画面ツリー直下のレンダリングエラーを補足する境界。
 *
 * React Native の致命的レンダリングエラーは赤画面で落ちるが、
 * 本番では空白になり原因不明になりがち。Boundary で補足して
 * 「再試行」ボタンと共にエラー詳細を表示することで、ユーザーが
 * せめてホームに戻れる状態にする。
 *
 * Note: イベントハンドラや非同期エラーは補足しない。
 * それらは ToastProvider + try/catch でカバーする。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    this.props.onError?.(error);
    // 開発時にスタックを確認できるようにコンソール出力
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error("ErrorBoundary caught:", error, info);
    }
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.title}>
              予期せぬエラーが発生しました
            </Text>
            <Text variant="bodyMedium" style={styles.message}>
              {this.state.error.message || "詳細不明"}
            </Text>
            {__DEV__ && this.state.error.stack && (
              <Text variant="bodySmall" style={styles.stack}>
                {this.state.error.stack}
              </Text>
            )}
            <View style={styles.actions}>
              <Button
                mode="contained"
                onPress={this.reset}
                buttonColor="#1a1a2e"
              >
                再試行
              </Button>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    );
  }
}
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    backgroundColor: "#fafafa",
    padding: 16,
  },
  card: { backgroundColor: "#ffffff" },
  title: { fontWeight: "700", color: "#991b1b", marginBottom: 12 },
  message: { color: "#1a1a2e", marginBottom: 12 },
  stack: {
    color: "#71717a",
    fontFamily: "monospace",
    fontSize: 11,
    marginBottom: 16,
  },
  actions: { flexDirection: "row", justifyContent: "flex-end" },
});
