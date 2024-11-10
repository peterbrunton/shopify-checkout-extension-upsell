import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  useAppMetafields,
  reactExtension,
  Divider,
  Image,
  Banner,
  Heading,
  Button,
  InlineLayout,
  BlockStack,
  Text,
  SkeletonText,
  SkeletonImage,
  useCartLines,
  useApplyCartLinesChange,
  useApi
} from "@shopify/ui-extensions-react/checkout";

const PLACEHOLDER_IMAGE = 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_medium.png?format=webp&v=1530129081';
const ERROR_DISPLAY_DURATION = 3000;

// Memoized helper functions
const getAvailableUpsellProduct = (products, cartLines) => {
  return products.find(product => 
    !cartLines.some(line => line.merchandise.product.id === product.id)
  );
};

function useUpsellProducts() {
  const { query } = useApi();
  const [state, setState] = useState({
    products: [],
    loading: true,
    error: null
  });
  
  const appMetafields = useAppMetafields();
  
  const headingText = useMemo(() => 
    appMetafields?.find(
      m => m.metafield.namespace === "checkout_offer" && m.metafield.key === "heading_text"
    )?.metafield.value || "You might also like",
    [appMetafields]
  );

  const fetchUpsellProducts = useCallback(async () => {    
    try {
      const collectionGID = appMetafields?.find(
        m => m.metafield.namespace === "checkout_offer" && m.metafield.key === "upsell_collection"
      )?.metafield.value;
      const collectionId = collectionGID?.split('/').pop();
      
      if (!collectionId) {
        setState(prev => ({ ...prev, loading: false }));
        return;
      }

      const { data: collectionData } = await query(
        `query getCollectionProducts($collectionId: ID!) {
          collection(id: $collectionId) {
            products(first: 5) {
              nodes {
                id
                title
                images(first: 1) {
                  nodes {
                    url
                  }
                }
                variants(first: 1) {
                  nodes {
                    id
                    price {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }`,
        {
          variables: { 
            collectionId: `gid://shopify/Collection/${collectionId}`
          },
        }
      );

      setState(prev => ({
        ...prev,
        products: collectionData?.collection?.products?.nodes || [],
        loading: false
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err.message,
        loading: false
      }));
    }
  }, [query, appMetafields]);

  useEffect(() => {
    fetchUpsellProducts();
  }, [fetchUpsellProducts]);

  return { ...state, headingText };
}

function useCartOperations() {
  const applyCartLinesChange = useApplyCartLinesChange();
  const [cartState, setCartState] = useState({
    adding: false,
    notification: null
  });

  const handleCartChange = useCallback(async (operation, id, quantity = 1) => {
    setCartState(prev => ({ ...prev, adding: true }));
    
    try {
      const changeConfig = {
        type: operation,
        quantity,
        ...(operation === 'addCartLine' ? { merchandiseId: id } : { id: String(id) })
      };
      
      const result = await applyCartLinesChange(changeConfig);

      if (result.type === 'error') {
        setCartState(prev => ({
          ...prev,
          notification: { 
            message: result.message,
            status: 'critical'
          }
        }));
      } else {
        setCartState(prev => ({
          ...prev,
          notification: {
            message: operation === 'addCartLine' ? 'Product added successfully' : 'Product removed successfully',
            status: 'success'
          }
        }));
      }
    } catch (err) {
      setCartState(prev => ({
        ...prev,
        notification: {
          message: 'An unexpected error occurred',
          status: 'critical'
        }
      }));
    } finally {
      setCartState(prev => ({ ...prev, adding: false }));
    }
  }, [applyCartLinesChange]);

  useEffect(() => {
    if (cartState.notification) {
      const timer = setTimeout(() => 
        setCartState(prev => ({ ...prev, notification: null })), 
        ERROR_DISPLAY_DURATION
      );
      return () => clearTimeout(timer);
    }
  }, [cartState.notification]);

  return { ...cartState, handleCartChange };
}

// Memoized components to prevent unnecessary re-renders
const MemoizedProductLineItem = React.memo(function ProductLineItem({ 
  line, 
  i18n, 
  onRemove, 
  adding 
}) {
  const title = line.merchandise?.title || 'Product';
  const imageUrl = line.merchandise?.image?.url ?? PLACEHOLDER_IMAGE;

  return (
    <InlineLayout 
      spacing='base'
      columns={[64, 'fill', 'auto']}
      blockAlignment='center'
    >
      <Image
        border='base'
        borderWidth='base'
        borderRadius='loose'
        source={imageUrl}
        accessibilityDescription={title}
        aspectRatio={1}
      />
      <BlockStack spacing='none'>
        <Text size='medium' emphasis='bold'>
          {title}
        </Text>
        <Text appearance='subdued'>
          {i18n.formatCurrency(line.cost?.totalAmount?.amount || 0)}
        </Text>
      </BlockStack>
      <Button
        kind='plain'
        loading={adding}
        accessibilityLabel={`Remove ${title} from cart`}
        onPress={onRemove}
        size="slim"
      >
        Remove
      </Button>
    </InlineLayout>
  );
});

const MemoizedProductOffer = React.memo(function ProductOffer({ 
  product, 
  i18n, 
  adding, 
  onAddToCart 
}) {
  const imageUrl = product.images?.nodes[0]?.url ?? PLACEHOLDER_IMAGE;
  const variantId = product.variants?.nodes[0]?.id;
  const price = product.variants?.nodes[0]?.price?.amount;

  if (!variantId) return null;

  return (
    <InlineLayout 
      spacing='base'
      columns={[64, 'fill', 'auto']}
      blockAlignment='center'
    >
      <Image
        border='base'
        borderWidth='base'
        borderRadius='loose'
        source={imageUrl}
        accessibilityDescription={product.title}
        aspectRatio={1}
      />
      <BlockStack spacing='none'>
        <Text size='medium' emphasis='bold'>
          {product.title}
        </Text>
        {price && (
          <Text appearance='subdued'>
            {i18n.formatCurrency(price)}
          </Text>
        )}
      </BlockStack>
      <Button
        kind='secondary'
        loading={adding}
        accessibilityLabel={`Add ${product.title} to cart`}
        onPress={() => onAddToCart(variantId)}
      >
        Add
      </Button>
    </InlineLayout>
  );
});

// Add this component definition before the Extension component
const LoadingSkeleton = React.memo(function LoadingSkeleton({ headingText }) {
  return (
    <BlockStack spacing='loose'>
      <Heading level={2}>{headingText}</Heading>
      <BlockStack spacing='loose'>
        {/* Render two skeleton items to match the loading state */}
        {[1, 2].map((key) => (
          <InlineLayout
            key={key}
            spacing='base'
            columns={[64, 'fill', 'auto']}
            blockAlignment='center'
          >
            <SkeletonImage aspectRatio={1} />
            <BlockStack spacing='none'>
              <SkeletonText inlineSize='large' />
              <SkeletonText inlineSize='small' />
            </BlockStack>
            <Button kind='secondary' disabled>
              Add
            </Button>
          </InlineLayout>
        ))}
      </BlockStack>
      <Divider />
    </BlockStack>
  );
});

function Extension() {
  const { i18n } = useApi();
  const lines = useCartLines();
  const { products, loading, error, headingText } = useUpsellProducts();
  const { adding, notification, handleCartChange } = useCartOperations();

  const addedUpsellProducts = useMemo(() => 
    lines.filter(line => 
      products.some(product => product.id === line.merchandise.product.id)
    ),
    [lines, products]
  );

  const upsellProduct = useMemo(() => 
    getAvailableUpsellProduct(products, lines),
    [products, lines]
  );

  if (loading) {
    return <LoadingSkeleton headingText={headingText} />;
  }

  if (error || (!upsellProduct && !addedUpsellProducts.length)) {
    return null;
  }

  return (
    <BlockStack spacing='loose'>
      <Heading level={2}>{headingText}</Heading>
      <BlockStack spacing='loose'>
        {addedUpsellProducts.map(line => (
          <MemoizedProductLineItem
            key={line.id}
            line={line}
            i18n={i18n}
            onRemove={() => handleCartChange('removeCartLine', String(line.id))}
            adding={adding}
          />
        ))}
        {upsellProduct && (
          <MemoizedProductOffer 
            product={upsellProduct}
            i18n={i18n}
            adding={adding}
            onAddToCart={(variantId) => handleCartChange('addCartLine', variantId)}
          />
        )}
      </BlockStack>
      {notification && (
        <Banner status={notification.status}>
          {notification.message}
        </Banner>
      )}
      <Divider />
    </BlockStack>
  );
}

export default reactExtension("purchase.checkout.block.render", () => <Extension />);